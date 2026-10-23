import { runtimeError } from '../errors.ts';
import type { CallContext, Interpreter } from '../interpreter.ts';
import { describeType, formatValue, int, string, type BooleanValue, type Value } from '../values.ts';
import { input } from './core.ts';

function expectBoolean(value: Value, what: string, context: CallContext): BooleanValue {
  if (value.type !== 'boolean') throw runtimeError(`${what} must be a boolean, got ${describeType(value)}`, context.position);
  return value;
}

export function registerBoolean(interpreter: Interpreter): void {
  interpreter.defineIn('boolean', 'to-string', 1, (inputs, context) => string(formatValue(expectBoolean(input(inputs, 0), 'the input of `boolean/to-string`', context), 'print')));

  interpreter.defineIn('boolean', 'to-int', 1, (inputs, context) => int(expectBoolean(input(inputs, 0), 'the input of `boolean/to-int`', context).value ? 1n : 0n));
}
