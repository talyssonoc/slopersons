import { SlopersonsError, runtimeError } from '../errors.ts';
import { ExitSignal, OutSignal, StopSignal, type CallContext, type Interpreter } from '../interpreter.ts';
import { IoFailure } from '../runtime/stream.ts';
import { NOTHING, array, describeType, formatValue, int, string, typeName, type ErrorValue, type Value } from '../values.ts';

export const MAX_SIZE = 50_000_000n;

export function checkSize(size: bigint, name: string, unit: string, context: CallContext): number {
  if (size > MAX_SIZE) {
    throw runtimeError(`\`${name}\` would build a value of ${size} ${unit}, which is more than the limit of ${MAX_SIZE}`, context.position);
  }
  return Number(size);
}

export function input(inputs: Value[], index: number): Value {
  return inputs[index] ?? NOTHING;
}

export function expectChar(value: Value, what: string, context: CallContext): string {
  if (value.type !== 'char') throw runtimeError(`${what} must be a char, got ${describeType(value)}`, context.position);
  return value.value;
}

export function expectDecision(value: Value, what: string, context: CallContext): boolean {
  if (value.type !== 'boolean') throw runtimeError(`${what} must return \`yes\` or \`no\`, got ${describeType(value)}`, context.position);
  return value.value;
}

export function expectError(value: Value, what: string, context: CallContext): ErrorValue {
  if (value.type !== 'error') throw runtimeError(`${what} must be an error, got ${describeType(value)}`, context.position);
  return value;
}

export function expectInt(value: Value, what: string, context: CallContext): bigint {
  if (value.type !== 'int') throw runtimeError(`${what} must be an int, got ${describeType(value)}`, context.position);
  return value.value;
}

export function expectString(value: Value, what: string, context: CallContext): string {
  if (value.type !== 'string') throw runtimeError(`${what} must be a string, got ${describeType(value)}`, context.position);
  return value.value;
}

export function expectProc(value: Value, what: string, context: CallContext): Value {
  if (value.type !== 'proc' && value.type !== 'builtin') throw runtimeError(`${what} must be a procedure, got ${describeType(value)}`, context.position);
  return value;
}

export function expectArray(value: Value, what: string, context: CallContext): Value[] {
  if (value.type !== 'array') throw runtimeError(`${what} must be an array, got ${describeType(value)}`, context.position);
  return value.items;
}

export function toIndex(value: Value, what: string, context: CallContext): number {
  const big = expectInt(value, what, context);
  if (big < 0n || big > BigInt(Number.MAX_SAFE_INTEGER)) throw runtimeError(`${what} is out of range: ${big}`, context.position);
  return Number(big);
}

export function callLambda(procedure: Value, inputs: Value[], context: CallContext): Value {
  return context.interpreter.callValue(procedure, inputs, context.position, context.environment);
}

export function callWithOptionalArgument(procedure: Value, argument: Value, context: CallContext): Value {
  if (procedure.type === 'proc' && procedure.parameters.length === 0) return callLambda(procedure, [], context);
  return callLambda(procedure, [argument], context);
}

export function runLoopBody(body: () => void): boolean {
  try {
    body();
    return true;
  } catch (signal) {
    if (signal instanceof StopSignal) return false;
    throw signal;
  }
}

export function runIo<Result>(context: CallContext, body: () => Result): Result {
  try {
    return body();
  } catch (error) {
    if (error instanceof IoFailure) throw runtimeError(error.message, context.position);
    throw error;
  }
}

export function registerCore(interpreter: Interpreter): void {
  interpreter.defineBuiltin('show', 1, (inputs) => string(formatValue(input(inputs, 0), 'show')));

  interpreter.defineBuiltin('type-of', 1, (inputs) => string(typeName(input(inputs, 0))));

  interpreter.defineBuiltin('do', { min: 1, max: null }, (inputs, context) => {
    const procedure = expectProc(input(inputs, 0), 'the input of `do`', context);
    return callLambda(procedure, inputs.slice(1), context);
  });

  interpreter.defineBuiltin('out', 1, (inputs, context) => {
    throw new OutSignal(context.environment.activation, input(inputs, 0), context.position);
  });

  interpreter.defineBuiltin('fail', 1, (inputs, context) => {
    const value = input(inputs, 0);
    if (value.type === 'error') throw new SlopersonsError('runtime', value.message, value.position ?? context.position);
    throw runtimeError(expectString(value, 'the message of `fail`', context), context.position);
  });

  interpreter.defineIn('error', 'message', 1, (inputs, context) => string(expectError(input(inputs, 0), 'the input of `error/message`', context).message));

  interpreter.defineIn('error', 'line', 1, (inputs, context) => {
    const value = expectError(input(inputs, 0), 'the input of `error/line`', context);
    return value.position !== null ? int(BigInt(value.position.line)) : NOTHING;
  });

  interpreter.defineIn('error', 'column', 1, (inputs, context) => {
    const value = expectError(input(inputs, 0), 'the input of `error/column`', context);
    return value.position !== null ? int(BigInt(value.position.col)) : NOTHING;
  });

  interpreter.defineIn('error', 'file', 1, (inputs, context) => {
    const value = expectError(input(inputs, 0), 'the input of `error/file`', context);
    return value.position?.file !== undefined ? string(value.position.file) : NOTHING;
  });

  interpreter.defineIn('error', 'to-string', 1, (inputs, context) => string(expectError(input(inputs, 0), 'the input of `error/to-string`', context).message));

  interpreter.defineBuiltin('exit', 1, (inputs, context) => {
    const code = expectInt(input(inputs, 0), 'the exit code', context);
    if (code < 0n || code > 255n) throw runtimeError(`the exit code must be between 0 and 255, got ${code}`, context.position);
    throw new ExitSignal(Number(code));
  });

  interpreter.defineIn('int', 'up-to', 2, (inputs, context) => {
    const from = expectInt(input(inputs, 0), 'the start of `int/up-to`', context);
    const to = expectInt(input(inputs, 1), 'the end of `int/up-to`', context);
    if (to >= from) checkSize(to - from + 1n, 'int/up-to', 'elements', context);
    const items: Value[] = [];
    for (let i = from; i <= to; i++) items.push(int(i));
    return array(items);
  });

  interpreter.defineIn('array', 'each', 2, (inputs, context) => {
    const items = expectArray(input(inputs, 0), 'the input of `array/each`', context);
    const procedure = expectProc(input(inputs, 1), 'the body of `array/each`', context);
    for (const item of items.slice()) {
      if (!runLoopBody(() => callLambda(procedure, [item], context))) break;
    }
    return NOTHING;
  });

  interpreter.defineIn('int', 'times', 2, (inputs, context) => {
    const times = expectInt(input(inputs, 0), 'the count of `int/times`', context);
    const procedure = expectProc(input(inputs, 1), 'the body of `int/times`', context);
    for (let i = 0n; i < times; i++) {
      if (!runLoopBody(() => callWithOptionalArgument(procedure, int(i), context))) break;
    }
    return NOTHING;
  });
}
