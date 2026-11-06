import type { Expression, FlowStatement, Lambda, Statement, Step } from './ast.ts';
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
import { NO_RANDOMNESS, type Randomness } from './runtime/random.ts';
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
  environment?: readonly (readonly [string, string])[];
  network?: Network;
  randomness?: Randomness;
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

export type Run = (environment: Environment) => Value;

function constant(value: Value): Run {
  return () => value;
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
  // `-> out` ending a statement of a procedure body records the return here instead of throwing an
  // OutSignal, which costs far more; every block stops at it and the call takes the value. Inside an
  // expression (a conditional or attempt in parentheses) the expression around it must not go on, so
  // `out` throws there, and a lambda turns a recorded return back into an OutSignal, since `out` leaves
  // the procedure that made the lambda, through any builtin that called it.
  private returning: OutSignal | null;
  private expressionDepth: number;
  private interruptionChecks: number;
  private nextActivation: number;
  private topActivation: number;
  currentFile: string | null;
  readonly programArguments: readonly string[];
  readonly environment: readonly (readonly [string, string])[];
  readonly network: Network;
  readonly randomness: Randomness;
  private readonly interruption: Interruption;
  readonly streams: StreamRegistry;
  readonly endHooks: (() => number)[];
  private readonly exportStack: ExportRequest[][];

  constructor(io: Io, options: InterpreterOptions = {}) {
    this.io = io;
    this.programArguments = options.programArguments ?? [];
    this.environment = options.environment ?? [];
    this.network = options.network ?? NO_NETWORK;
    this.randomness = options.randomness ?? NO_RANDOMNESS;
    this.interruption = options.interruption ?? NO_INTERRUPTION;
    this.streams = new StreamRegistry();
    this.endHooks = [];
    this.builtins = new Map();
    this.methods = new Map();
    this.depth = 0;
    this.returning = null;
    this.expressionDepth = 0;
    this.interruptionChecks = 0;
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

  builtinNames(): string[] {
    return [...this.builtins.keys()];
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
      const value = this.compileBlock(program)(environment);
      const returning = this.returning;
      if (returning !== null) throw returning;
      return value;
    } catch (signal) {
      throw this.escapedSignalError(signal);
    } finally {
      this.returning = null;
      this.expressionDepth = 0;
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

  // Programs are compiled once into nested functions, one per node of the syntax tree, so running a node
  // calls its function instead of dispatching on its kind each time. Each function does what the node
  // means, in the same order and with the same errors as a walk over the tree.
  compileBlock(statements: Statement[]): Run {
    const runs = statements.map((statement) => this.compileStatement(statement));
    return (environment) => {
      let result: Value = NOTHING;
      for (const run of runs) {
        result = run(environment);
        if (this.returning !== null) return NOTHING;
      }
      return result;
    };
  }

  private compileStatement(statement: Statement): Run {
    switch (statement.kind) {
      case 'flow-statement':
        return this.compileFlowStatement(statement);
      case 'proc': {
        const body = this.compileBlock(statement.body);
        const { name, parameters, position } = statement;
        return (environment) => {
          const procedure: ProcedureValue = { type: 'proc', id: freshId(), name, parameters, run: body, environment, isProc: true };
          environment.bindLocal(name, procedure, position);
          return NOTHING;
        };
      }
      case 'while': {
        const condition = this.compileCondition(statement.condition);
        const body = this.compileBlock(statement.body);
        return (environment) => {
          while (condition(environment)) {
            this.checkInterruption();
            try {
              body(environment);
            } catch (signal) {
              if (signal instanceof StopSignal) break;
              throw signal;
            }
            if (this.returning !== null) break;
          }
          return NOTHING;
        };
      }
      case 'conditional':
        return this.compileConditional(statement);
      case 'stop': {
        const { position } = statement;
        return () => {
          throw new StopSignal(position);
        };
      }
      case 'attempt':
        return this.compileAttempt(statement);
      case 'export': {
        const { names, position } = statement;
        return () => {
          const requests = this.exportStack[this.exportStack.length - 1];
          if (requests !== undefined) for (const name of names) requests.push({ name, position });
          return NOTHING;
        };
      }
    }
  }

  // `-> out` ending a statement records the return instead of throwing (see `returning`), when `out` is
  // the builtin and no expression is being evaluated around the statement; otherwise it runs as a call.
  private compileFlowStatement(statement: FlowStatement): Run {
    const flow = statement.expression;
    const whole = this.compileExpression(flow);
    if (flow.kind !== 'flow') return whole;
    const last = flow.steps[flow.steps.length - 1];
    if (last === undefined || last.kind !== 'call' || last.callee.kind !== 'name' || last.callee.name !== 'out' || last.arguments.length > 0 || last.body !== null) return whole;
    const head = this.compileExpression(flow.head);
    const before = flow.steps.slice(0, -1).map((step) => this.compileStep(step));
    const position = last.position;
    return (environment) => {
      if (this.expressionDepth !== 0) return whole(environment);
      const callee = environment.lookup('out') ?? this.builtins.get('out');
      if (callee === undefined || callee.type !== 'builtin' || callee.name !== 'out') return whole(environment);
      let value = head(environment);
      for (const step of before) value = step(value, environment);
      this.checkInterruption();
      this.returning = new OutSignal(environment.activation, value, position);
      return NOTHING;
    };
  }

  private compileAttempt(statement: Expression & { kind: 'attempt' }): Run {
    const body = this.compileBlock(statement.body);
    const handler = statement.handler === null ? null : this.compileBlock(statement.handler);
    const cleanup = statement.cleanup === null ? null : this.compileBlock(statement.cleanup);
    const { errorName } = statement;
    return (environment) => {
      let outcome: { value: Value } | { thrown: unknown };
      try {
        outcome = { value: body(environment) };
      } catch (error) {
        if (isRuntimeError(error) && handler !== null) {
          if (errorName !== null) environment.defineParam(errorName, errorValue(error));
          try {
            outcome = { value: handler(environment) };
          } catch (inner) {
            outcome = { thrown: inner };
          }
        } else {
          outcome = { thrown: error };
        }
      }
      if (cleanup !== null && cleanupRuns(outcome)) {
        const pending = this.returning;
        this.returning = null;
        cleanup(environment);
        if (this.returning === null) this.returning = pending;
      }
      if ('thrown' in outcome) throw outcome.thrown;
      return outcome.value;
    };
  }

  private compileConditional(expression: Expression & { kind: 'conditional' }): Run {
    const branches = expression.branches.map((branch) => ({ condition: this.compileCondition(branch.condition), body: this.compileBlock(branch.body) }));
    const otherwise = expression.otherwise === null ? null : this.compileBlock(expression.otherwise);
    return (environment) => {
      for (const branch of branches) {
        if (branch.condition(environment)) return branch.body(environment);
      }
      return otherwise === null ? NOTHING : otherwise(environment);
    };
  }

  private compileCondition(expression: Expression): (environment: Environment) => boolean {
    const run = this.compileExpression(expression);
    const { position } = expression;
    return (environment) => {
      const value = run(environment);
      if (value.type !== 'boolean') throw runtimeError(`a condition must be \`yes\` or \`no\`, got ${describeType(value)}`, position);
      return value.value;
    };
  }

  // Inside a conditional or `attempt` used as a value, `out` must throw, so the expression around it
  // does not go on with a value it never got.
  private insideExpression(run: Run): Run {
    return (environment) => {
      this.expressionDepth++;
      try {
        return run(environment);
      } finally {
        this.expressionDepth--;
      }
    };
  }

  compileExpression(expression: Expression): Run {
    switch (expression.kind) {
      case 'name': {
        const { name, position } = expression;
        return (environment) => this.lookup(name, position, environment);
      }
      case 'int':
        return constant(int(expression.value));
      case 'binary':
        return this.compileBinary(expression);
      case 'flow': {
        const head = this.compileExpression(expression.head);
        const steps = expression.steps.map((step) => this.compileStep(step));
        return (environment) => {
          let value = head(environment);
          for (const step of steps) value = step(value, environment);
          return value;
        };
      }
      case 'qualified': {
        const { parts, position } = expression;
        return (environment) => this.resolveQualified(parts, position, environment);
      }
      case 'string':
        return constant(string(expression.value));
      case 'boolean':
        return constant(expression.value ? YES : NO);
      case 'conditional':
        return this.insideExpression(this.compileConditional(expression));
      case 'lambda':
        return this.compileLambda(expression);
      case 'interpolation': {
        const parts = expression.parts.map((part) => (typeof part === 'string' ? part : this.compileExpression(part)));
        return (environment) => {
          let text = '';
          for (const part of parts) text += typeof part === 'string' ? part : formatValue(part(environment), 'print');
          return string(text);
        };
      }
      case 'unary': {
        const operand = this.compileExpression(expression.operand);
        const { position } = expression;
        if (expression.operator === 'not') {
          return (environment) => {
            const value = operand(environment);
            if (value.type !== 'boolean') throw runtimeError(`\`not\` needs a boolean, got ${describeType(value)}`, position);
            return boolean(!value.value);
          };
        }
        return (environment) => {
          const value = operand(environment);
          if (value.type === 'int') return int(-value.value);
          if (value.type === 'float') return float(-value.value);
          throw runtimeError(`cannot negate ${describeType(value)}`, position);
        };
      }
      case 'float':
        return constant(float(expression.value));
      case 'char':
        return constant(char(expression.value));
      case 'nothing':
        return constant(NOTHING);
      case 'array': {
        const items = expression.items.map((item) => this.compileExpression(item));
        return (environment) => array(items.map((item) => item(environment)));
      }
      case 'map': {
        const entries = expression.entries.map((entry) => ({ key: this.compileExpression(entry.key), value: this.compileExpression(entry.value) }));
        return (environment) => {
          const map = newMap();
          for (const entry of entries) map.table.set(entry.key(environment), entry.value(environment));
          return map;
        };
      }
      case 'attempt':
        return this.insideExpression(this.compileAttempt(expression));
    }
  }

  private compileLambda(lambda: Lambda): Run {
    const body = this.compileBlock(lambda.body);
    const { parameters } = lambda;
    return (environment) => ({ type: 'proc', id: freshId(), name: null, parameters, run: body, environment, isProc: false });
  }

  private compileStep(step: Step): (piped: Value, environment: Environment) => Value {
    if (step.kind === 'bind') {
      const { name, position } = step;
      if (step.outer) {
        return (piped, environment) => {
          environment.bindOuter(name, piped, position);
          return piped;
        };
      }
      return (piped, environment) => {
        environment.bindLocal(name, piped, position);
        return piped;
      };
    }
    const callee = this.compileExpression(step.callee);
    const inputs = step.arguments.map((argument) => this.compileExpression(argument));
    const body = step.body === null ? null : this.compileLambda(step.body);
    const { position } = step;
    return (piped, environment) => {
      const procedure = callee(environment);
      const values: Value[] = [piped];
      for (const input of inputs) values.push(input(environment));
      if (body !== null) values.push(body(environment));
      return this.callValue(procedure, values, position, environment);
    };
  }

  // Each operator gets its own function with the int case first, the commonest by far; anything else
  // goes through arithmetic and compareValues, which hold the rules and the errors.
  private compileBinary(expression: Expression & { kind: 'binary' }): Run {
    const left = this.compileExpression(expression.left);
    const right = this.compileExpression(expression.right);
    const { operator, position } = expression;
    if (operator === 'and' || operator === 'or') {
      const leftPosition = expression.left.position;
      const rightPosition = expression.right.position;
      return (environment) => {
        const first = left(environment);
        if (first.type !== 'boolean') throw runtimeError(`\`${operator}\` needs booleans, got ${describeType(first)}`, leftPosition);
        if (operator === 'and' && !first.value) return NO;
        if (operator === 'or' && first.value) return YES;
        const second = right(environment);
        if (second.type !== 'boolean') throw runtimeError(`\`${operator}\` needs booleans, got ${describeType(second)}`, rightPosition);
        return second;
      };
    }
    switch (operator) {
      case '=':
        return (environment) => boolean(valuesEqual(left(environment), right(environment)));
      case '/=':
        return (environment) => boolean(!valuesEqual(left(environment), right(environment)));
      case '<':
        return (environment) => {
          const first = left(environment);
          const second = right(environment);
          if (first.type === 'int' && second.type === 'int') return first.value < second.value ? YES : NO;
          return boolean(compareValues(first, second, position) < 0);
        };
      case '>':
        return (environment) => {
          const first = left(environment);
          const second = right(environment);
          if (first.type === 'int' && second.type === 'int') return first.value > second.value ? YES : NO;
          return boolean(compareValues(first, second, position) > 0);
        };
      case '<=':
        return (environment) => {
          const first = left(environment);
          const second = right(environment);
          if (first.type === 'int' && second.type === 'int') return first.value <= second.value ? YES : NO;
          return boolean(compareValues(first, second, position) <= 0);
        };
      case '>=':
        return (environment) => {
          const first = left(environment);
          const second = right(environment);
          if (first.type === 'int' && second.type === 'int') return first.value >= second.value ? YES : NO;
          return boolean(compareValues(first, second, position) >= 0);
        };
      case '+':
        return (environment) => {
          const first = left(environment);
          const second = right(environment);
          if (first.type === 'int' && second.type === 'int') return int(first.value + second.value);
          return arithmetic(operator, first, second, position);
        };
      case '-':
        return (environment) => {
          const first = left(environment);
          const second = right(environment);
          if (first.type === 'int' && second.type === 'int') return int(first.value - second.value);
          return arithmetic(operator, first, second, position);
        };
      case '*':
        return (environment) => {
          const first = left(environment);
          const second = right(environment);
          if (first.type === 'int' && second.type === 'int') return int(first.value * second.value);
          return arithmetic(operator, first, second, position);
        };
      default:
        return (environment) => arithmetic(operator, left(environment), right(environment), position);
    }
  }

  private resolveQualified(parts: string[], position: Position, environment: Environment): Value {
    let value = this.lookup(parts[0] ?? '', position, environment);
    for (let index = 1; index < parts.length; index++) {
      const part = parts[index] ?? '';
      if (value.type !== 'module') {
        const prefix = parts.slice(0, index).join('/');
        throw runtimeError(`\`${prefix}\` is ${describeType(value)}, not a module, so \`${prefix}/${part}\` cannot be looked up`, position);
      }
      const member = value.members.get(part);
      if (member === undefined) throw runtimeError(`module \`${parts.slice(0, index).join('/')}\` has no exported name \`${part}\``, position);
      value = member;
    }
    return value;
  }

  private lookup(name: string, position: Position, environment: Environment): Value {
    const value = environment.lookup(name) ?? this.builtins.get(name);
    if (value === undefined) throw runtimeError(`unknown name \`${name}\``, position);
    return value;
  }

  // Taking the flag is an atomic operation on memory shared with the main thread; doing it on every
  // call and loop pass cost about 5% of a program's time. Every 1024th still stops a busy loop at once.
  private checkInterruption(): void {
    this.interruptionChecks = (this.interruptionChecks + 1) & 1023;
    if (this.interruptionChecks === 0 && this.interruption.take()) throw new InterruptSignal();
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
    const expressionDepth = this.expressionDepth;
    this.expressionDepth = 0;
    try {
      const result = callee.run(frame);
      const returning = this.returning;
      if (returning === null) return result;
      this.returning = null;
      if (callee.isProc && returning.activation === frame.activation) return returning.value;
      throw returning;
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
      this.expressionDepth = expressionDepth;
    }
  }

  private checkArity(name: string, arity: Arity, count: number, position: Position): void {
    const ok = count >= arity.min && (arity.max === null || count <= arity.max);
    if (ok) return;
    const expected = arity.max === null ? `at least ${arity.min}` : arity.min === arity.max ? `${arity.min}` : `${arity.min} to ${arity.max}`;
    const noun = expected === '1' ? 'argument' : 'arguments';
    throw runtimeError(`\`${name}\` expects ${expected} ${noun}, got ${count}`, position);
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
