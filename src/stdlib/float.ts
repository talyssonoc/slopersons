import { runtimeError } from '../errors.ts';
import type { CallContext, Interpreter } from '../interpreter.ts';
import { bool, describeType, int, type Value } from '../values.ts';
import { arg } from './core.ts';

function expectFloat(value: Value, what: string, ctx: CallContext): number {
  if (value.t !== 'float') throw runtimeError(`${what} must be a float, got ${describeType(value)}`, ctx.pos);
  return value.v;
}

function finiteInput(args: Value[], name: string, ctx: CallContext): number {
  const n = expectFloat(arg(args, 0), `the input of \`${name}\``, ctx);
  if (!Number.isFinite(n)) throw runtimeError(`the input of \`${name}\` is not a finite float`, ctx.pos);
  return n;
}

function roundHalfAwayFromZero(n: number): number {
  return n < 0 ? -Math.round(-n) : Math.round(n);
}

export function registerFloat(interp: Interpreter): void {
  interp.defineMethod('round', 'float', 1, (args, ctx) => int(BigInt(roundHalfAwayFromZero(finiteInput(args, 'round', ctx)))));

  interp.defineMethod('floor', 'float', 1, (args, ctx) => int(BigInt(Math.floor(finiteInput(args, 'floor', ctx)))));

  interp.defineMethod('ceil', 'float', 1, (args, ctx) => int(BigInt(Math.ceil(finiteInput(args, 'ceil', ctx)))));

  interp.defineMethod('to-int', 'float', 1, (args, ctx) => int(BigInt(Math.trunc(finiteInput(args, 'to-int', ctx)))));

  interp.defineMethod('is-integer', 'float', 1, (args, ctx) => bool(Number.isInteger(expectFloat(arg(args, 0), 'the input of `is-integer`', ctx))));
}
