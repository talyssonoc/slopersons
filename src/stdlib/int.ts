import { runtimeError } from '../errors.ts';
import type { CallContext, Interpreter } from '../interpreter.ts';
import { boolean, char, compareValues, describeType, float, formatValue, int, string, type FloatValue, type IntValue, type Value } from '../values.ts';
import { input, expectInt } from './core.ts';

type NumberValue = IntValue | FloatValue;

const MAX_CODE_POINT = 0x10ffffn;
const SURROGATE_LOW = 0xd800n;
const SURROGATE_HIGH = 0xdfffn;

function expectNumber(value: Value, what: string, context: CallContext): NumberValue {
  if (value.type !== 'int' && value.type !== 'float') throw runtimeError(`${what} must be an int or a float, got ${describeType(value)}`, context.position);
  return value;
}

function toFloat(value: NumberValue, what: string, context: CallContext): number {
  if (value.type === 'float') return value.value;
  const item = Number(value.value);
  if (!Number.isFinite(item)) throw runtimeError(`${what} is too large for a float`, context.position);
  return item;
}

function isNegative(value: NumberValue): boolean {
  return value.type === 'int' ? value.value < 0n : value.value < 0;
}

function intPow(base: bigint, exponent: bigint, context: CallContext): bigint {
  try {
    return base ** exponent;
  } catch (error) {
    if (error instanceof RangeError) throw runtimeError('the result of `pow` is too large', context.position);
    throw error;
  }
}

function floatPow(base: number, exponent: number, context: CallContext): number {
  if (base === 0 && exponent < 0) throw runtimeError('`pow` of zero with a negative exponent', context.position);
  const result = base ** exponent;
  if (Number.isNaN(result)) throw runtimeError('`pow` of a negative number with a fractional exponent', context.position);
  if (!Number.isFinite(result)) throw runtimeError('the result of `pow` is too large for a float', context.position);
  return result;
}

export function registerInt(interpreter: Interpreter): void {
  interpreter.defineMethod('abs', ['int', 'float'], 1, (inputs, context) => {
    const value = expectNumber(input(inputs, 0), 'the input of `abs`', context);
    return value.type === 'int' ? int(value.value < 0n ? -value.value : value.value) : float(Math.abs(value.value));
  });

  interpreter.defineMethod('pow', ['int', 'float'], 2, (inputs, context) => {
    const base = expectNumber(input(inputs, 0), 'the input of `pow`', context);
    const exponent = expectNumber(input(inputs, 1), 'the exponent of `pow`', context);
    if (base.type === 'int' && exponent.type === 'int' && exponent.value >= 0n) return int(intPow(base.value, exponent.value, context));
    return float(floatPow(toFloat(base, 'the input of `pow`', context), toFloat(exponent, 'the exponent of `pow`', context), context));
  });

  interpreter.defineMethod('sqrt', ['int', 'float'], 1, (inputs, context) => {
    const value = expectNumber(input(inputs, 0), 'the input of `sqrt`', context);
    if (isNegative(value)) throw runtimeError('`sqrt` of a negative number', context.position);
    return float(Math.sqrt(toFloat(value, 'the input of `sqrt`', context)));
  });

  interpreter.defineMethod('min', ['int', 'float'], 2, (inputs, context) => {
    const value = expectNumber(input(inputs, 0), 'the input of `min`', context);
    const other = expectNumber(input(inputs, 1), 'the other value of `min`', context);
    return compareValues(other, value, context.position) < 0 ? other : value;
  });

  interpreter.defineMethod('max', ['int', 'float'], 2, (inputs, context) => {
    const value = expectNumber(input(inputs, 0), 'the input of `max`', context);
    const other = expectNumber(input(inputs, 1), 'the other value of `max`', context);
    return compareValues(other, value, context.position) > 0 ? other : value;
  });

  interpreter.defineMethod('clamp', ['int', 'float'], 3, (inputs, context) => {
    const value = expectNumber(input(inputs, 0), 'the input of `clamp`', context);
    const low = expectNumber(input(inputs, 1), 'the low bound of `clamp`', context);
    const high = expectNumber(input(inputs, 2), 'the high bound of `clamp`', context);
    if (compareValues(low, high, context.position) > 0) {
      throw runtimeError(`the low bound of \`clamp\` must not be greater than the high bound, got ${formatValue(low, 'print')} and ${formatValue(high, 'print')}`, context.position);
    }
    if (compareValues(value, low, context.position) < 0) return low;
    if (compareValues(value, high, context.position) > 0) return high;
    return value;
  });

  interpreter.defineMethod('sign', ['int', 'float'], 1, (inputs, context) => {
    const value = expectNumber(input(inputs, 0), 'the input of `sign`', context);
    if (value.type === 'int') return int(value.value < 0n ? -1n : value.value > 0n ? 1n : 0n);
    return int(value.value < 0 ? -1n : value.value > 0 ? 1n : 0n);
  });

  interpreter.defineMethod('to-string', ['int', 'float'], 1, (inputs, context) => string(formatValue(expectNumber(input(inputs, 0), 'the input of `to-string`', context), 'print')));

  interpreter.defineMethod('is-even', 'int', 1, (inputs, context) => boolean(expectInt(input(inputs, 0), 'the input of `is-even`', context) % 2n === 0n));

  interpreter.defineMethod('is-odd', 'int', 1, (inputs, context) => boolean(expectInt(input(inputs, 0), 'the input of `is-odd`', context) % 2n !== 0n));

  interpreter.defineMethod('to-float', 'int', 1, (inputs, context) => {
    const value = expectNumber(input(inputs, 0), 'the input of `to-float`', context);
    return float(toFloat(value, 'the input of `to-float`', context));
  });

  interpreter.defineMethod('to-int', 'int', 1, (inputs, context) => int(expectInt(input(inputs, 0), 'the input of `to-int`', context)));

  interpreter.defineMethod('to-char', 'int', 1, (inputs, context) => {
    const code = expectInt(input(inputs, 0), 'the input of `to-char`', context);
    if (code < 0n || code > MAX_CODE_POINT) {
      throw runtimeError(`the input of \`to-char\` must be a code point between 0 and ${MAX_CODE_POINT}, got ${code}`, context.position);
    }
    if (code >= SURROGATE_LOW && code <= SURROGATE_HIGH) {
      throw runtimeError(`the input of \`to-char\` must not be a surrogate code point (${SURROGATE_LOW} to ${SURROGATE_HIGH}), got ${code}`, context.position);
    }
    return char(String.fromCodePoint(Number(code)));
  });
}
