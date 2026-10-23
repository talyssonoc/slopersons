import { runtimeError } from '../errors.ts';
import type { CallContext, Interpreter } from '../interpreter.ts';
import { describeType, formatValue, int, str, type BoolValue, type Value } from '../values.ts';
import { arg } from './core.ts';

function expectBoolean(value: Value, what: string, ctx: CallContext): BoolValue {
  if (value.t !== 'bool') throw runtimeError(`${what} must be a boolean, got ${describeType(value)}`, ctx.pos);
  return value;
}

export function registerBoolean(interp: Interpreter): void {
  interp.defineMethod('to-string', 'boolean', 1, (args, ctx) => str(formatValue(expectBoolean(arg(args, 0), 'the input of `to-string`', ctx), 'print')));

  interp.defineMethod('to-int', 'boolean', 1, (args, ctx) => int(expectBoolean(arg(args, 0), 'the input of `to-int`', ctx).v ? 1n : 0n));
}
