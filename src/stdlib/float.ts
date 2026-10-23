import { runtimeError } from '../errors.ts';
import type { CallContext, Interpreter } from '../interpreter.ts';
import { boolean, describeType, int, type Value } from '../values.ts';
import { input } from './core.ts';

function expectFloat(value: Value, what: string, context: CallContext): number {
  if (value.type !== 'float') throw runtimeError(`${what} must be a float, got ${describeType(value)}`, context.position);
  return value.value;
}

function finiteInput(inputs: Value[], name: string, context: CallContext): number {
  const value = expectFloat(input(inputs, 0), `the input of \`${name}\``, context);
  if (!Number.isFinite(value)) throw runtimeError(`the input of \`${name}\` is not a finite float`, context.position);
  return value;
}

function roundHalfAwayFromZero(value: number): number {
  return value < 0 ? -Math.round(-value) : Math.round(value);
}

export function registerFloat(interpreter: Interpreter): void {
  interpreter.defineMethod('round', 'float', 1, (inputs, context) => int(BigInt(roundHalfAwayFromZero(finiteInput(inputs, 'round', context)))));

  interpreter.defineMethod('floor', 'float', 1, (inputs, context) => int(BigInt(Math.floor(finiteInput(inputs, 'floor', context)))));

  interpreter.defineMethod('ceil', 'float', 1, (inputs, context) => int(BigInt(Math.ceil(finiteInput(inputs, 'ceil', context)))));

  interpreter.defineMethod('to-int', 'float', 1, (inputs, context) => int(BigInt(Math.trunc(finiteInput(inputs, 'to-int', context)))));

  interpreter.defineMethod('is-integer', 'float', 1, (inputs, context) => boolean(Number.isInteger(expectFloat(input(inputs, 0), 'the input of `is-integer`', context))));
}
