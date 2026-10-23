import { runtimeError } from '../errors.ts';
import type { CallContext, Interpreter } from '../interpreter.ts';
import { bool, char, compareValues, describeType, float, formatValue, int, str, type FloatValue, type IntValue, type Value } from '../values.ts';
import { arg, expectInt } from './core.ts';

type NumberValue = IntValue | FloatValue;

const MAX_CODE_POINT = 0x10ffffn;
const SURROGATE_LOW = 0xd800n;
const SURROGATE_HIGH = 0xdfffn;

function expectNumber(value: Value, what: string, ctx: CallContext): NumberValue {
  if (value.t !== 'int' && value.t !== 'float') throw runtimeError(`${what} must be an int or a float, got ${describeType(value)}`, ctx.pos);
  return value;
}

function toFloat(value: NumberValue, what: string, ctx: CallContext): number {
  if (value.t === 'float') return value.v;
  const n = Number(value.v);
  if (!Number.isFinite(n)) throw runtimeError(`${what} is too large for a float`, ctx.pos);
  return n;
}

function isNegative(value: NumberValue): boolean {
  return value.t === 'int' ? value.v < 0n : value.v < 0;
}

function intPow(base: bigint, exponent: bigint, ctx: CallContext): bigint {
  try {
    return base ** exponent;
  } catch (error) {
    if (error instanceof RangeError) throw runtimeError('the result of `pow` is too large', ctx.pos);
    throw error;
  }
}

function floatPow(base: number, exponent: number, ctx: CallContext): number {
  if (base === 0 && exponent < 0) throw runtimeError('`pow` of zero with a negative exponent', ctx.pos);
  const result = base ** exponent;
  if (Number.isNaN(result)) throw runtimeError('`pow` of a negative number with a fractional exponent', ctx.pos);
  if (!Number.isFinite(result)) throw runtimeError('the result of `pow` is too large for a float', ctx.pos);
  return result;
}

export function registerInt(interp: Interpreter): void {
  interp.defineMethod('abs', ['int', 'float'], 1, (args, ctx) => {
    const value = expectNumber(arg(args, 0), 'the input of `abs`', ctx);
    return value.t === 'int' ? int(value.v < 0n ? -value.v : value.v) : float(Math.abs(value.v));
  });

  interp.defineMethod('pow', ['int', 'float'], 2, (args, ctx) => {
    const base = expectNumber(arg(args, 0), 'the input of `pow`', ctx);
    const exponent = expectNumber(arg(args, 1), 'the exponent of `pow`', ctx);
    if (base.t === 'int' && exponent.t === 'int' && exponent.v >= 0n) return int(intPow(base.v, exponent.v, ctx));
    return float(floatPow(toFloat(base, 'the input of `pow`', ctx), toFloat(exponent, 'the exponent of `pow`', ctx), ctx));
  });

  interp.defineMethod('sqrt', ['int', 'float'], 1, (args, ctx) => {
    const value = expectNumber(arg(args, 0), 'the input of `sqrt`', ctx);
    if (isNegative(value)) throw runtimeError('`sqrt` of a negative number', ctx.pos);
    return float(Math.sqrt(toFloat(value, 'the input of `sqrt`', ctx)));
  });

  interp.defineMethod('min', ['int', 'float'], 2, (args, ctx) => {
    const value = expectNumber(arg(args, 0), 'the input of `min`', ctx);
    const other = expectNumber(arg(args, 1), 'the other value of `min`', ctx);
    return compareValues(other, value, ctx.pos) < 0 ? other : value;
  });

  interp.defineMethod('max', ['int', 'float'], 2, (args, ctx) => {
    const value = expectNumber(arg(args, 0), 'the input of `max`', ctx);
    const other = expectNumber(arg(args, 1), 'the other value of `max`', ctx);
    return compareValues(other, value, ctx.pos) > 0 ? other : value;
  });

  interp.defineMethod('clamp', ['int', 'float'], 3, (args, ctx) => {
    const value = expectNumber(arg(args, 0), 'the input of `clamp`', ctx);
    const low = expectNumber(arg(args, 1), 'the low bound of `clamp`', ctx);
    const high = expectNumber(arg(args, 2), 'the high bound of `clamp`', ctx);
    if (compareValues(low, high, ctx.pos) > 0) {
      throw runtimeError(`the low bound of \`clamp\` must not be greater than the high bound, got ${formatValue(low, 'print')} and ${formatValue(high, 'print')}`, ctx.pos);
    }
    if (compareValues(value, low, ctx.pos) < 0) return low;
    if (compareValues(value, high, ctx.pos) > 0) return high;
    return value;
  });

  interp.defineMethod('sign', ['int', 'float'], 1, (args, ctx) => {
    const value = expectNumber(arg(args, 0), 'the input of `sign`', ctx);
    if (value.t === 'int') return int(value.v < 0n ? -1n : value.v > 0n ? 1n : 0n);
    return int(value.v < 0 ? -1n : value.v > 0 ? 1n : 0n);
  });

  interp.defineMethod('to-string', ['int', 'float'], 1, (args, ctx) => str(formatValue(expectNumber(arg(args, 0), 'the input of `to-string`', ctx), 'print')));

  interp.defineMethod('is-even', 'int', 1, (args, ctx) => bool(expectInt(arg(args, 0), 'the input of `is-even`', ctx) % 2n === 0n));

  interp.defineMethod('is-odd', 'int', 1, (args, ctx) => bool(expectInt(arg(args, 0), 'the input of `is-odd`', ctx) % 2n !== 0n));

  interp.defineMethod('to-float', 'int', 1, (args, ctx) => {
    const value = expectNumber(arg(args, 0), 'the input of `to-float`', ctx);
    return float(toFloat(value, 'the input of `to-float`', ctx));
  });

  interp.defineMethod('to-int', 'int', 1, (args, ctx) => int(expectInt(arg(args, 0), 'the input of `to-int`', ctx)));

  interp.defineMethod('to-char', 'int', 1, (args, ctx) => {
    const code = expectInt(arg(args, 0), 'the input of `to-char`', ctx);
    if (code < 0n || code > MAX_CODE_POINT) {
      throw runtimeError(`the input of \`to-char\` must be a code point between 0 and ${MAX_CODE_POINT}, got ${code}`, ctx.pos);
    }
    if (code >= SURROGATE_LOW && code <= SURROGATE_HIGH) {
      throw runtimeError(`the input of \`to-char\` must not be a surrogate code point (${SURROGATE_LOW} to ${SURROGATE_HIGH}), got ${code}`, ctx.pos);
    }
    return char(String.fromCodePoint(Number(code)));
  });
}
