import type { Expression, Lambda, Statement, Step } from './ast.ts';
import { SlopersonsError, runtimeError, type Position } from './errors.ts';
import {
  NO,
  NOTHING,
  YES,
  array,
  boolean,
  char,
  compareValues,
  describeType,
  errorValue,
  float,
  formatValue,
  freshId,
  int,
  newMap,
  string,
  valuesEqual,
  typeName,
  type Arity,
  type BuiltinImplementation,
  type ModuleValue,
  type ProcedureValue,
  type TypeName,
  type Value,
} from './values.ts';
import { NO_NETWORK, type Network } from './runtime/network.ts';
import { StreamRegistry } from './runtime/stream.ts';

export interface Io {
  write(text: string): void;
  writeError(text: string): void;
  readInput(buffer: Uint8Array): number;
}

export interface CallContext {
  interpreter: Interpreter;
  position: Position;
  environment: Environment;
}

export class ExitSignal {
  readonly code: number;

  constructor(code: number) {
    this.code = code;
  }
}

export const EXIT_INTERRUPTED = 130;

export class InterruptSignal extends ExitSignal {
  constructor() {
    super(EXIT_INTERRUPTED);
  }
}

export interface Interruption {
  take(): boolean;
  clear(): void;
}

export const NO_INTERRUPTION: Interruption = { take: () => false, clear: () => {} };

export interface InterpreterOptions {
  programArguments?: readonly string[];
  network?: Network;
  interruption?: Interruption;
}

export class OutSignal {
  readonly activation: number;
  readonly value: Value;
  readonly position: Position;

  constructor(activation: number, value: Value, location: Position) {
    this.activation = activation;
    this.value = value;
    this.position = location;
  }
}

export class StopSignal {
  readonly position: Position;

  constructor(location: Position) {
    this.position = location;
  }
}

export class Environment {
  private readonly vars: Map<string, Value>;
  readonly parent: Environment | null;
  readonly activation: number;

  constructor(parent: Environment | null, activation: number) {
    this.vars = new Map();
    this.parent = parent;
    this.activation = activation;
  }

  lookup(name: string): Value | undefined {
    let environment: Environment | null = this;
    while (environment !== null) {
      const value = environment.vars.get(name);
      if (value !== undefined) return value;
      environment = environment.parent;
    }
    return undefined;
  }

  private sameActivationAncestorHas(name: string): boolean {
    let environment = this.parent;
    while (environment !== null && environment.activation === this.activation) {
      if (environment.vars.has(name)) return true;
      environment = environment.parent;
    }
    return false;
  }

  defineParam(name: string, value: Value): void {
    this.vars.set(name, value);
  }

  bindLocal(name: string, value: Value, position: Position): void {
    if (!this.vars.has(name) && this.sameActivationAncestorHas(name)) {
      throw runtimeError(`\`${name}\` already exists in an enclosing scope; use \`=>> ${name}\` to update it or choose another name`, position);
    }
    this.vars.set(name, value);
  }

  bindOuter(name: string, value: Value, position: Position): void {
    let environment: Environment | null = this;
    while (environment !== null) {
      if (environment.vars.has(name)) {
        environment.vars.set(name, value);
        return;
      }
      environment = environment.parent;
    }
    throw runtimeError(`\`=>> ${name}\` found no existing binding named \`${name}\``, position);
  }
}

export const MAX_CALL_DEPTH = 10_000;

export interface ExportRequest {
  name: string;
  position: Position;
}

export interface ModuleRun {
  environment: Environment;
  exports: ExportRequest[];
}

interface MethodImpl {
  arity: Arity;
  implementation: BuiltinImplementation;
}

export class Interpreter {
  readonly io: Io;
  private readonly builtins: Map<string, Value>;
  private readonly methods: Map<string, Map<TypeName, MethodImpl>>;
  private depth: number;
  private nextActivation: number;
  private topActivation: number;
  currentFile: string | null;
  readonly programArguments: readonly string[];
  readonly network: Network;
  private readonly interruption: Interruption;
  readonly streams: StreamRegistry;
  readonly endHooks: (() => number)[];
  private readonly exportStack: ExportRequest[][];

  constructor(io: Io, options: InterpreterOptions = {}) {
    this.io = io;
    this.programArguments = options.programArguments ?? [];
    this.network = options.network ?? NO_NETWORK;
    this.interruption = options.interruption ?? NO_INTERRUPTION;
    this.streams = new StreamRegistry();
    this.endHooks = [];
    this.builtins = new Map();
    this.methods = new Map();
    this.depth = 0;
    this.nextActivation = 0;
    this.topActivation = -1;
    this.currentFile = null;
    this.exportStack = [];
  }

  defineBuiltin(name: string, arity: number | Arity, procedure: BuiltinImplementation): void {
    if (this.builtins.has(name)) throw new Error(`builtin \`${name}\` is registered twice`);
    const normalized: Arity = typeof arity === 'number' ? { min: arity, max: arity } : arity;
    this.builtins.set(name, { type: 'builtin', id: freshId(), name, arity: normalized, implementation: procedure });
  }

  builtin(name: string): Value | undefined {
    return this.builtins.get(name);
  }

  builtinModule(name: string): ModuleValue {
    const existing = this.builtins.get(name);
    if (existing !== undefined) {
      if (existing.type === 'module') return existing;
      throw new Error(`builtin \`${name}\` is registered twice`);
    }
    const module: ModuleValue = { type: 'module', id: freshId(), name, path: `<builtin ${name}>`, members: new Map() };
    this.builtins.set(name, module);
    return module;
  }

  defineIn(moduleName: string, name: string, arity: number | Arity, procedure: BuiltinImplementation): void {
    const module = this.builtinModule(moduleName);
    const qualified = `${moduleName}/${name}`;
    if (module.members.has(name)) throw new Error(`builtin \`${qualified}\` is registered twice`);
    const normalized: Arity = typeof arity === 'number' ? { min: arity, max: arity } : arity;
    module.members.set(name, { type: 'builtin', id: freshId(), name: qualified, arity: normalized, implementation: procedure });
  }

  defineValueIn(moduleName: string, name: string, value: Value): void {
    const module = this.builtinModule(moduleName);
    if (module.members.has(name)) throw new Error(`builtin \`${moduleName}/${name}\` is registered twice`);
    module.members.set(name, value);
  }

  defineMethodIn(moduleName: string, name: string, types: TypeName | TypeName[], arity: number | Arity, procedure: BuiltinImplementation): void {
    const qualified = `${moduleName}/${name}`;
    let table = this.methods.get(qualified);
    if (table === undefined) {
      table = new Map();
      this.methods.set(qualified, table);
      this.defineIn(moduleName, name, { min: 1, max: null }, (inputs, context) => this.dispatch(qualified, inputs, context));
    }
    const normalized: Arity = typeof arity === 'number' ? { min: arity, max: arity } : arity;
    for (const type of Array.isArray(types) ? types : [types]) {
      if (table.has(type)) throw new Error(`\`${qualified}\` is registered twice for ${type}`);
      table.set(type, { arity: normalized, implementation: procedure });
    }
  }

  private dispatch(name: string, inputs: Value[], context: CallContext): Value {
    const receiver = inputs[0] ?? NOTHING;
    const table = this.methods.get(name);
    const method = table?.get(typeName(receiver));
    if (table === undefined || method === undefined) {
      const supported = table === undefined ? '' : `; it works on ${[...table.keys()].join(', ')}`;
      throw runtimeError(`\`${name}\` cannot be used with ${describeType(receiver)}${supported}`, context.position);
    }
    this.checkArity(name, method.arity, inputs.length, context.position);
    return method.implementation(inputs, context);
  }

  createTopLevelEnvironment(): Environment {
    const environment = new Environment(null, this.newActivation());
    this.topActivation = environment.activation;
    return environment;
  }

  run(program: Statement[]): Value {
    return this.runIn(program, this.createTopLevelEnvironment());
  }

  runModule(program: Statement[], file: string): ModuleRun {
    const previousFile = this.currentFile;
    const previousTop = this.topActivation;
    const exports: ExportRequest[] = [];
    this.exportStack.push(exports);
    this.currentFile = file;
    try {
      const environment = this.createTopLevelEnvironment();
      this.runIn(program, environment);
      return { environment, exports };
    } finally {
      this.exportStack.pop();
      this.currentFile = previousFile;
      this.topActivation = previousTop;
    }
  }

  runIn(program: Statement[], environment: Environment): Value {
    try {
      return this.execBlock(program, environment);
    } catch (signal) {
      throw this.escapedSignalError(signal);
    }
  }

  private escapedSignalError(signal: unknown): unknown {
    if (signal instanceof StopSignal) return runtimeError('`stop` outside of a loop', signal.position);
    if (signal instanceof OutSignal) {
      if (signal.activation === this.topActivation) return runtimeError('`out` outside of a procedure', signal.position);
      return runtimeError('`out` was reached from a lambda whose procedure has already returned', signal.position);
    }
    return signal;
  }

  private newActivation(): number {
    return this.nextActivation++;
  }

  execBlock(statements: Statement[], environment: Environment): Value {
    let result: Value = NOTHING;
    for (const statement of statements) result = this.execStatement(statement, environment);
    return result;
  }

  execStatement(statement: Statement, environment: Environment): Value {
    switch (statement.kind) {
      case 'flow-statement':
        return this.evaluateExpression(statement.expression, environment);
      case 'proc': {
        const procedure: ProcedureValue = {
          type: 'proc',
          id: freshId(),
          name: statement.name,
          parameters: statement.parameters,
          body: statement.body,
          environment,
          isProc: true,
        };
        environment.bindLocal(statement.name, procedure, statement.position);
        return NOTHING;
      }
      case 'while':
        while (this.evalCondition(statement.condition, environment)) {
          this.checkInterruption();
          try {
            this.execBlock(statement.body, environment);
          } catch (signal) {
            if (signal instanceof StopSignal) break;
            throw signal;
          }
        }
        return NOTHING;
      case 'conditional':
        return this.evalConditional(statement, environment);
      case 'stop':
        throw new StopSignal(statement.position);
      case 'attempt':
        return this.execAttempt(statement, environment);
      case 'export': {
        const requests = this.exportStack[this.exportStack.length - 1];
        if (requests !== undefined) for (const name of statement.names) requests.push({ name, position: statement.position });
        return NOTHING;
      }
    }
  }

  private execAttempt(statement: Expression & { kind: 'attempt' }, environment: Environment): Value {
    let outcome: { value: Value } | { thrown: unknown };
    try {
      outcome = { value: this.execBlock(statement.body, environment) };
    } catch (error) {
      if (isRuntimeError(error) && statement.handler !== null) {
        if (statement.errorName !== null) environment.defineParam(statement.errorName, errorValue(error));
        try {
          outcome = { value: this.execBlock(statement.handler, environment) };
        } catch (inner) {
          outcome = { thrown: inner };
        }
      } else {
        outcome = { thrown: error };
      }
    }
    if (statement.cleanup !== null && cleanupRuns(outcome)) this.execBlock(statement.cleanup, environment);
    if ('thrown' in outcome) throw outcome.thrown;
    return outcome.value;
  }

  private evalConditional(expression: Expression & { kind: 'conditional' }, environment: Environment): Value {
    for (const branch of expression.branches) {
      if (this.evalCondition(branch.condition, environment)) return this.execBlock(branch.body, environment);
    }
    return expression.otherwise === null ? NOTHING : this.execBlock(expression.otherwise, environment);
  }

  private evalCondition(expression: Expression, environment: Environment): boolean {
    const value = this.evaluateExpression(expression, environment);
    if (value.type !== 'boolean') throw runtimeError(`a condition must be \`yes\` or \`no\`, got ${describeType(value)}`, expression.position);
    return value.value;
  }

  evaluateExpression(expression: Expression, environment: Environment): Value {
    switch (expression.kind) {
      case 'int':
        return int(expression.value);
      case 'float':
        return float(expression.value);
      case 'string':
        return string(expression.value);
      case 'char':
        return char(expression.value);
      case 'boolean':
        return expression.value ? YES : NO;
      case 'nothing':
        return NOTHING;
      case 'name':
        return this.lookup(expression.name, expression.position, environment);
      case 'qualified':
        return this.resolveQualified(expression.parts, expression.position, environment);
      case 'interpolation': {
        let text = '';
        for (const part of expression.parts) text += typeof part === 'string' ? part : formatValue(this.evaluateExpression(part, environment), 'print');
        return string(text);
      }
      case 'array':
        return array(expression.items.map((item) => this.evaluateExpression(item, environment)));
      case 'map': {
        const map = newMap();
        for (const entry of expression.entries) map.table.set(this.evaluateExpression(entry.key, environment), this.evaluateExpression(entry.value, environment));
        return map;
      }
      case 'binary':
        return this.evalBinary(expression, environment);
      case 'unary': {
        const operand = this.evaluateExpression(expression.operand, environment);
        if (expression.operator === 'not') {
          if (operand.type !== 'boolean') throw runtimeError(`\`not\` needs a boolean, got ${describeType(operand)}`, expression.position);
          return boolean(!operand.value);
        }
        if (operand.type === 'int') return int(-operand.value);
        if (operand.type === 'float') return float(-operand.value);
        throw runtimeError(`cannot negate ${describeType(operand)}`, expression.position);
      }
      case 'flow': {
        let value = this.evaluateExpression(expression.head, environment);
        for (const step of expression.steps) value = this.evalStep(step, value, environment);
        return value;
      }
      case 'lambda':
        return this.makeLambda(expression, environment);
      case 'conditional':
        return this.evalConditional(expression, environment);
      case 'attempt':
        return this.execAttempt(expression, environment);
    }
  }

  private resolveQualified(parts: string[], position: Position, environment: Environment): Value {
    let value = this.lookup(parts[0] ?? '', position, environment);
    for (let index = 1; index < parts.length; index++) {
      const part = parts[index] ?? '';
      const prefix = parts.slice(0, index).join('/');
      if (value.type !== 'module') {
        throw runtimeError(`\`${prefix}\` is ${describeType(value)}, not a module, so \`${prefix}/${part}\` cannot be looked up`, position);
      }
      const member = value.members.get(part);
      if (member === undefined) throw runtimeError(`module \`${prefix}\` has no exported name \`${part}\``, position);
      value = member;
    }
    return value;
  }

  private lookup(name: string, position: Position, environment: Environment): Value {
    const value = environment.lookup(name) ?? this.builtins.get(name);
    if (value === undefined) throw runtimeError(`unknown name \`${name}\``, position);
    return value;
  }

  private makeLambda(lambda: Lambda, environment: Environment): ProcedureValue {
    return { type: 'proc', id: freshId(), name: null, parameters: lambda.parameters, body: lambda.body, environment, isProc: false };
  }

  private evalStep(step: Step, piped: Value, environment: Environment): Value {
    if (step.kind === 'bind') {
      if (step.outer) {
        environment.bindOuter(step.name, piped, step.position);
      } else {
        environment.bindLocal(step.name, piped, step.position);
      }
      return piped;
    }
    const callee = this.evaluateExpression(step.callee, environment);
    const inputs: Value[] = [piped];
    for (const argument of step.arguments) inputs.push(this.evaluateExpression(argument, environment));
    if (step.body !== null) inputs.push(this.makeLambda(step.body, environment));
    return this.callValue(callee, inputs, step.position, environment);
  }

  private checkInterruption(): void {
    if (this.interruption.take()) throw new InterruptSignal();
  }

  clearInterruption(): void {
    this.interruption.clear();
  }

  callValue(callee: Value, inputs: Value[], location: Position, environment: Environment): Value {
    this.checkInterruption();
    if (callee.type === 'builtin') {
      this.checkArity(callee.name, callee.arity, inputs.length, location);
      return callee.implementation(inputs, { interpreter: this, position: location, environment });
    }
    if (callee.type !== 'proc') throw runtimeError(`cannot call ${describeType(callee)}; only procedures can be called`, location);
    const label = callee.name ?? 'lambda';
    this.checkArity(label, { min: callee.parameters.length, max: callee.parameters.length }, inputs.length, location);
    if (this.depth >= MAX_CALL_DEPTH) {
      throw runtimeError(`too many nested procedure calls (the limit is ${MAX_CALL_DEPTH})`, location);
    }
    const frame = new Environment(callee.environment, callee.isProc ? this.newActivation() : callee.environment.activation);
    for (let i = 0; i < callee.parameters.length; i++) {
      const name = callee.parameters[i];
      const value = inputs[i];
      if (name !== undefined && value !== undefined) frame.defineParam(name, value);
    }
    this.depth++;
    try {
      return this.execBlock(callee.body, frame);
    } catch (signal) {
      if (callee.isProc) {
        if (signal instanceof OutSignal && signal.activation === frame.activation) return signal.value;
        if (signal instanceof StopSignal) {
          throw runtimeError('`stop` cannot leave a procedure; it only exits the loop it is written in', signal.position);
        }
      }
      throw signal;
    } finally {
      this.depth--;
    }
  }

  private checkArity(name: string, arity: Arity, count: number, position: Position): void {
    const ok = count >= arity.min && (arity.max === null || count <= arity.max);
    if (ok) return;
    const expected = arity.max === null ? `at least ${arity.min}` : arity.min === arity.max ? `${arity.min}` : `${arity.min} to ${arity.max}`;
    const noun = expected === '1' ? 'argument' : 'arguments';
    throw runtimeError(`\`${name}\` expects ${expected} ${noun}, got ${count}`, position);
  }

  private evalBinary(expression: Expression & { kind: 'binary' }, environment: Environment): Value {
    if (expression.operator === 'and' || expression.operator === 'or') {
      const left = this.evaluateExpression(expression.left, environment);
      if (left.type !== 'boolean') throw runtimeError(`\`${expression.operator}\` needs booleans, got ${describeType(left)}`, expression.left.position);
      if (expression.operator === 'and' && !left.value) return NO;
      if (expression.operator === 'or' && left.value) return YES;
      const right = this.evaluateExpression(expression.right, environment);
      if (right.type !== 'boolean') throw runtimeError(`\`${expression.operator}\` needs booleans, got ${describeType(right)}`, expression.right.position);
      return right;
    }
    const left = this.evaluateExpression(expression.left, environment);
    const right = this.evaluateExpression(expression.right, environment);
    switch (expression.operator) {
      case '=':
        return boolean(valuesEqual(left, right));
      case '/=':
        return boolean(!valuesEqual(left, right));
      case '<':
        return boolean(compareValues(left, right, expression.position) < 0);
      case '>':
        return boolean(compareValues(left, right, expression.position) > 0);
      case '<=':
        return boolean(compareValues(left, right, expression.position) <= 0);
      case '>=':
        return boolean(compareValues(left, right, expression.position) >= 0);
      default:
        return arithmetic(expression.operator, left, right, expression.position);
    }
  }
}

function isRuntimeError(error: unknown): error is SlopersonsError {
  return error instanceof SlopersonsError && error.kind === 'runtime';
}

function cleanupRuns(outcome: { value: Value } | { thrown: unknown }): boolean {
  if (!('thrown' in outcome)) return true;
  const thrown = outcome.thrown;
  return isRuntimeError(thrown) || thrown instanceof OutSignal || thrown instanceof StopSignal;
}

type ArithOp = '+' | '-' | '*' | '/' | 'mod';

function floorDiv(dividend: bigint, divisor: bigint): bigint {
  const quotient = dividend / divisor;
  const remainder = dividend % divisor;
  return remainder !== 0n && (remainder < 0n) !== (divisor < 0n) ? quotient - 1n : quotient;
}

function floorMod(dividend: bigint, divisor: bigint): bigint {
  const remainder = dividend % divisor;
  return remainder !== 0n && (remainder < 0n) !== (divisor < 0n) ? remainder + divisor : remainder;
}

export function arithmetic(operator: ArithOp, left: Value, right: Value, position: Position): Value {
  if (left.type === 'int' && right.type === 'int') {
    switch (operator) {
      case '+':
        return int(left.value + right.value);
      case '-':
        return int(left.value - right.value);
      case '*':
        return int(left.value * right.value);
      case '/':
        if (right.value === 0n) throw runtimeError('division by zero', position);
        return int(floorDiv(left.value, right.value));
      case 'mod':
        if (right.value === 0n) throw runtimeError('`mod` by zero', position);
        return int(floorMod(left.value, right.value));
    }
  }
  if ((left.type === 'int' || left.type === 'float') && (right.type === 'int' || right.type === 'float')) {
    const first = left.type === 'int' ? Number(left.value) : left.value;
    const second = right.type === 'int' ? Number(right.value) : right.value;
    switch (operator) {
      case '+':
        return float(first + second);
      case '-':
        return float(first - second);
      case '*':
        return float(first * second);
      case '/':
        if (second === 0) throw runtimeError('division by zero', position);
        return float(first / second);
      case 'mod':
        if (second === 0) throw runtimeError('`mod` by zero', position);
        return float(first - second * Math.floor(first / second));
    }
  }
  if (operator === '+' && left.type === 'string' && right.type === 'string') return string(left.value + right.value);
  const verb = operator === '+' ? 'add' : operator === '-' ? 'subtract' : operator === '*' ? 'multiply' : operator === '/' ? 'divide' : 'take `mod` of';
  throw runtimeError(`cannot ${verb} ${describeType(left)} and ${describeType(right)}`, position);
}
