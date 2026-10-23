import type { Expr, Lambda, Statement, Step } from './ast.ts';
import { runtimeError, type Pos } from './errors.ts';
import {
  NO,
  NOTHING,
  YES,
  array,
  bool,
  char,
  compareValues,
  describeType,
  float,
  formatValue,
  freshId,
  int,
  newMap,
  str,
  valuesEqual,
  typeName,
  type Arity,
  type BuiltinFn,
  type BuiltinValue,
  type ProcValue,
  type TypeName,
  type Value,
} from './values.ts';

export interface Io {
  write(text: string): void;
  readLine(): string | null;
}

export interface CallContext {
  interp: Interpreter;
  pos: Pos;
  env: Env;
}

export class ExitSignal {
  readonly code: number;

  constructor(code: number) {
    this.code = code;
  }
}

export class OutSignal {
  readonly activation: number;
  readonly value: Value;
  readonly pos: Pos;

  constructor(activation: number, value: Value, pos: Pos) {
    this.activation = activation;
    this.value = value;
    this.pos = pos;
  }
}

export class StopSignal {
  readonly pos: Pos;

  constructor(pos: Pos) {
    this.pos = pos;
  }
}

export class Env {
  private readonly vars: Map<string, Value>;
  readonly parent: Env | null;
  readonly activation: number;

  constructor(parent: Env | null, activation: number) {
    this.vars = new Map();
    this.parent = parent;
    this.activation = activation;
  }

  lookup(name: string): Value | undefined {
    let env: Env | null = this;
    while (env !== null) {
      const value = env.vars.get(name);
      if (value !== undefined) return value;
      env = env.parent;
    }
    return undefined;
  }

  private sameActivationAncestorHas(name: string): boolean {
    let env = this.parent;
    while (env !== null && env.activation === this.activation) {
      if (env.vars.has(name)) return true;
      env = env.parent;
    }
    return false;
  }

  defineParam(name: string, value: Value): void {
    this.vars.set(name, value);
  }

  bindLocal(name: string, value: Value, pos: Pos): void {
    if (!this.vars.has(name) && this.sameActivationAncestorHas(name)) {
      throw runtimeError(`\`${name}\` already exists in an enclosing scope; use \`=>> ${name}\` to update it or choose another name`, pos);
    }
    this.vars.set(name, value);
  }

  bindOuter(name: string, value: Value, pos: Pos): void {
    let env: Env | null = this;
    while (env !== null) {
      if (env.vars.has(name)) {
        env.vars.set(name, value);
        return;
      }
      env = env.parent;
    }
    throw runtimeError(`\`=>> ${name}\` found no existing binding named \`${name}\``, pos);
  }
}

export const MAX_CALL_DEPTH = 10_000;

interface MethodImpl {
  arity: Arity;
  fn: BuiltinFn;
}

export class Interpreter {
  readonly io: Io;
  private readonly builtins: Map<string, BuiltinValue>;
  private readonly methods: Map<string, Map<TypeName, MethodImpl>>;
  private depth: number;
  private nextActivation: number;
  private topActivation: number;

  constructor(io: Io) {
    this.io = io;
    this.builtins = new Map();
    this.methods = new Map();
    this.depth = 0;
    this.nextActivation = 0;
    this.topActivation = -1;
  }

  defineBuiltin(name: string, arity: number | Arity, fn: BuiltinFn): void {
    if (this.builtins.has(name)) throw new Error(`builtin \`${name}\` is registered twice`);
    const normalized: Arity = typeof arity === 'number' ? { min: arity, max: arity } : arity;
    this.builtins.set(name, { t: 'builtin', id: freshId(), name, arity: normalized, fn });
  }

  builtin(name: string): BuiltinValue | undefined {
    return this.builtins.get(name);
  }

  defineMethod(name: string, types: TypeName | TypeName[], arity: number | Arity, fn: BuiltinFn): void {
    let table = this.methods.get(name);
    if (table === undefined) {
      if (this.builtins.has(name)) throw new Error(`\`${name}\` is already a plain builtin and cannot also dispatch on a type`);
      table = new Map();
      this.methods.set(name, table);
      this.defineBuiltin(name, { min: 1, max: null }, (args, ctx) => this.dispatch(name, args, ctx));
    }
    const normalized: Arity = typeof arity === 'number' ? { min: arity, max: arity } : arity;
    for (const type of Array.isArray(types) ? types : [types]) {
      if (table.has(type)) throw new Error(`\`${name}\` is registered twice for ${type}`);
      table.set(type, { arity: normalized, fn });
    }
  }

  private dispatch(name: string, args: Value[], ctx: CallContext): Value {
    const receiver = args[0] ?? NOTHING;
    const table = this.methods.get(name);
    const impl = table?.get(typeName(receiver));
    if (table === undefined || impl === undefined) {
      const supported = table === undefined ? '' : `; it works on ${[...table.keys()].join(', ')}`;
      throw runtimeError(`\`${name}\` cannot be used with ${describeType(receiver)}${supported}`, ctx.pos);
    }
    this.checkArity(name, impl.arity, args.length, ctx.pos);
    return impl.fn(args, ctx);
  }

  run(program: Statement[]): Value {
    const env = new Env(null, this.newActivation());
    this.topActivation = env.activation;
    try {
      return this.execBlock(program, env);
    } catch (signal) {
      throw this.escapedSignalError(signal);
    }
  }

  private escapedSignalError(signal: unknown): unknown {
    if (signal instanceof StopSignal) return runtimeError('`stop` outside of a loop', signal.pos);
    if (signal instanceof OutSignal) {
      if (signal.activation === this.topActivation) return runtimeError('`out` outside of a procedure', signal.pos);
      return runtimeError('`out` was reached from a lambda whose procedure has already returned', signal.pos);
    }
    return signal;
  }

  private newActivation(): number {
    return this.nextActivation++;
  }

  execBlock(statements: Statement[], env: Env): Value {
    let result: Value = NOTHING;
    for (const statement of statements) result = this.execStatement(statement, env);
    return result;
  }

  execStatement(statement: Statement, env: Env): Value {
    switch (statement.kind) {
      case 'flowstmt':
        return this.evalExpr(statement.expr, env);
      case 'proc': {
        const proc: ProcValue = {
          t: 'proc',
          id: freshId(),
          name: statement.name,
          params: statement.params,
          body: statement.body,
          env,
          isProc: true,
        };
        env.bindLocal(statement.name, proc, statement.pos);
        return NOTHING;
      }
      case 'while':
        while (this.evalCondition(statement.cond, env)) {
          try {
            this.execBlock(statement.body, env);
          } catch (signal) {
            if (signal instanceof StopSignal) break;
            throw signal;
          }
        }
        return NOTHING;
      case 'cond':
        return this.evalConditional(statement, env);
      case 'stop':
        throw new StopSignal(statement.pos);
    }
  }

  private evalConditional(expr: Expr & { kind: 'cond' }, env: Env): Value {
    for (const branch of expr.branches) {
      if (this.evalCondition(branch.cond, env)) return this.execBlock(branch.body, env);
    }
    return expr.otherwise === null ? NOTHING : this.execBlock(expr.otherwise, env);
  }

  private evalCondition(expr: Expr, env: Env): boolean {
    const value = this.evalExpr(expr, env);
    if (value.t !== 'bool') throw runtimeError(`a condition must be \`yes\` or \`no\`, got ${describeType(value)}`, expr.pos);
    return value.v;
  }

  evalExpr(expr: Expr, env: Env): Value {
    switch (expr.kind) {
      case 'int':
        return int(expr.value);
      case 'float':
        return float(expr.value);
      case 'string':
        return str(expr.value);
      case 'char':
        return char(expr.value);
      case 'bool':
        return expr.value ? YES : NO;
      case 'nothing':
        return NOTHING;
      case 'name':
        return this.lookup(expr.name, expr.pos, env);
      case 'interp': {
        let text = '';
        for (const part of expr.parts) text += typeof part === 'string' ? part : formatValue(this.evalExpr(part, env), 'print');
        return str(text);
      }
      case 'array':
        return array(expr.items.map((item) => this.evalExpr(item, env)));
      case 'map': {
        const map = newMap();
        for (const entry of expr.entries) map.table.set(this.evalExpr(entry.key, env), this.evalExpr(entry.value, env));
        return map;
      }
      case 'binary':
        return this.evalBinary(expr, env);
      case 'unary': {
        const operand = this.evalExpr(expr.operand, env);
        if (expr.op === 'not') {
          if (operand.t !== 'bool') throw runtimeError(`\`not\` needs a boolean, got ${describeType(operand)}`, expr.pos);
          return bool(!operand.v);
        }
        if (operand.t === 'int') return int(-operand.v);
        if (operand.t === 'float') return float(-operand.v);
        throw runtimeError(`cannot negate ${describeType(operand)}`, expr.pos);
      }
      case 'flow': {
        let value = this.evalExpr(expr.head, env);
        for (const step of expr.steps) value = this.evalStep(step, value, env);
        return value;
      }
      case 'lambda':
        return this.makeLambda(expr, env);
      case 'cond':
        return this.evalConditional(expr, env);
    }
  }

  private lookup(name: string, pos: Pos, env: Env): Value {
    const value = env.lookup(name) ?? this.builtins.get(name);
    if (value === undefined) throw runtimeError(`unknown name \`${name}\``, pos);
    return value;
  }

  private makeLambda(lambda: Lambda, env: Env): ProcValue {
    return { t: 'proc', id: freshId(), name: null, params: lambda.params, body: lambda.body, env, isProc: false };
  }

  private evalStep(step: Step, piped: Value, env: Env): Value {
    if (step.kind === 'bind') {
      if (step.outer) {
        env.bindOuter(step.name, piped, step.pos);
      } else {
        env.bindLocal(step.name, piped, step.pos);
      }
      return piped;
    }
    const callee = this.evalExpr(step.callee, env);
    const args: Value[] = [piped];
    for (const arg of step.args) args.push(this.evalExpr(arg, env));
    if (step.body !== null) args.push(this.makeLambda(step.body, env));
    return this.callValue(callee, args, step.pos, env);
  }

  callValue(callee: Value, args: Value[], pos: Pos, env: Env): Value {
    if (callee.t === 'builtin') {
      this.checkArity(callee.name, callee.arity, args.length, pos);
      return callee.fn(args, { interp: this, pos, env });
    }
    if (callee.t !== 'proc') throw runtimeError(`cannot call ${describeType(callee)}; only procedures can be called`, pos);
    const label = callee.name ?? 'lambda';
    this.checkArity(label, { min: callee.params.length, max: callee.params.length }, args.length, pos);
    if (this.depth >= MAX_CALL_DEPTH) {
      throw runtimeError(`too many nested procedure calls (the limit is ${MAX_CALL_DEPTH})`, pos);
    }
    const frame = new Env(callee.env, callee.isProc ? this.newActivation() : callee.env.activation);
    for (let i = 0; i < callee.params.length; i++) {
      const name = callee.params[i];
      const value = args[i];
      if (name !== undefined && value !== undefined) frame.defineParam(name, value);
    }
    this.depth++;
    try {
      return this.execBlock(callee.body, frame);
    } catch (signal) {
      if (callee.isProc) {
        if (signal instanceof OutSignal && signal.activation === frame.activation) return signal.value;
        if (signal instanceof StopSignal) {
          throw runtimeError('`stop` cannot leave a procedure; it only exits the loop it is written in', signal.pos);
        }
      }
      throw signal;
    } finally {
      this.depth--;
    }
  }

  private checkArity(name: string, arity: Arity, count: number, pos: Pos): void {
    const ok = count >= arity.min && (arity.max === null || count <= arity.max);
    if (ok) return;
    const expected = arity.max === null ? `at least ${arity.min}` : arity.min === arity.max ? `${arity.min}` : `${arity.min} to ${arity.max}`;
    const noun = expected === '1' ? 'argument' : 'arguments';
    throw runtimeError(`\`${name}\` expects ${expected} ${noun}, got ${count}`, pos);
  }

  private evalBinary(expr: Expr & { kind: 'binary' }, env: Env): Value {
    if (expr.op === 'and' || expr.op === 'or') {
      const left = this.evalExpr(expr.left, env);
      if (left.t !== 'bool') throw runtimeError(`\`${expr.op}\` needs booleans, got ${describeType(left)}`, expr.left.pos);
      if (expr.op === 'and' && !left.v) return NO;
      if (expr.op === 'or' && left.v) return YES;
      const right = this.evalExpr(expr.right, env);
      if (right.t !== 'bool') throw runtimeError(`\`${expr.op}\` needs booleans, got ${describeType(right)}`, expr.right.pos);
      return right;
    }
    const left = this.evalExpr(expr.left, env);
    const right = this.evalExpr(expr.right, env);
    switch (expr.op) {
      case '=':
        return bool(valuesEqual(left, right));
      case '/=':
        return bool(!valuesEqual(left, right));
      case '<':
        return bool(compareValues(left, right, expr.pos) < 0);
      case '>':
        return bool(compareValues(left, right, expr.pos) > 0);
      case '<=':
        return bool(compareValues(left, right, expr.pos) <= 0);
      case '>=':
        return bool(compareValues(left, right, expr.pos) >= 0);
      default:
        return arithmetic(expr.op, left, right, expr.pos);
    }
  }
}

type ArithOp = '+' | '-' | '*' | '/' | 'mod';

function floorDiv(a: bigint, b: bigint): bigint {
  const q = a / b;
  const r = a % b;
  return r !== 0n && (r < 0n) !== (b < 0n) ? q - 1n : q;
}

function floorMod(a: bigint, b: bigint): bigint {
  const r = a % b;
  return r !== 0n && (r < 0n) !== (b < 0n) ? r + b : r;
}

export function arithmetic(op: ArithOp, left: Value, right: Value, pos: Pos): Value {
  if (left.t === 'int' && right.t === 'int') {
    switch (op) {
      case '+':
        return int(left.v + right.v);
      case '-':
        return int(left.v - right.v);
      case '*':
        return int(left.v * right.v);
      case '/':
        if (right.v === 0n) throw runtimeError('division by zero', pos);
        return int(floorDiv(left.v, right.v));
      case 'mod':
        if (right.v === 0n) throw runtimeError('`mod` by zero', pos);
        return int(floorMod(left.v, right.v));
    }
  }
  if ((left.t === 'int' || left.t === 'float') && (right.t === 'int' || right.t === 'float')) {
    const a = left.t === 'int' ? Number(left.v) : left.v;
    const b = right.t === 'int' ? Number(right.v) : right.v;
    switch (op) {
      case '+':
        return float(a + b);
      case '-':
        return float(a - b);
      case '*':
        return float(a * b);
      case '/':
        if (b === 0) throw runtimeError('division by zero', pos);
        return float(a / b);
      case 'mod':
        if (b === 0) throw runtimeError('`mod` by zero', pos);
        return float(a - b * Math.floor(a / b));
    }
  }
  if (op === '+' && left.t === 'string' && right.t === 'string') return str(left.v + right.v);
  const verb = op === '+' ? 'add' : op === '-' ? 'subtract' : op === '*' ? 'multiply' : op === '/' ? 'divide' : 'take `mod` of';
  throw runtimeError(`cannot ${verb} ${describeType(left)} and ${describeType(right)}`, pos);
}
