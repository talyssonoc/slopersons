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
  interpreter.defineIn('float', 'round', 1, (inputs, context) => int(BigInt(roundHalfAwayFromZero(finiteInput(inputs, 'float/round', context)))));

  interpreter.defineIn('float', 'floor', 1, (inputs, context) => int(BigInt(Math.floor(finiteInput(inputs, 'float/floor', context)))));

  interpreter.defineIn('float', 'ceil', 1, (inputs, context) => int(BigInt(Math.ceil(finiteInput(inputs, 'float/ceil', context)))));

  interpreter.defineIn('float', 'to-int', 1, (inputs, context) => int(BigInt(Math.trunc(finiteInput(inputs, 'float/to-int', context)))));

  interpreter.defineIn('float', 'is-integer', 1, (inputs, context) => boolean(Number.isInteger(expectFloat(input(inputs, 0), 'the input of `float/is-integer`', context))));
}
