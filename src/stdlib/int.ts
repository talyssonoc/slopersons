import { runtimeError } from '../errors.ts';
import type { CallContext, Interpreter } from '../interpreter.ts';
import { boolean, char, compareValues, describeType, float, formatValue, int, string, type FloatValue, type IntValue, type Value } from '../values.ts';
import { randomBetween } from '../runtime/random.ts';
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
    if (error instanceof RangeError) throw runtimeError('the result of `math/pow` is too large', context.position);
    throw error;
  }
}

function floatPow(base: number, exponent: number, context: CallContext): number {
  if (base === 0 && exponent < 0) throw runtimeError('`math/pow` of zero with a negative exponent', context.position);
  const result = base ** exponent;
  if (Number.isNaN(result)) throw runtimeError('`math/pow` of a negative number with a fractional exponent', context.position);
  if (!Number.isFinite(result)) throw runtimeError('the result of `math/pow` is too large for a float', context.position);
  return result;
}

export function registerInt(interpreter: Interpreter): void {
  interpreter.defineIn('int', 'random', 2, (inputs, context) => {
    const low = expectInt(input(inputs, 0), 'the start of `int/random`', context);
    const high = expectInt(input(inputs, 1), 'the end of `int/random`', context);
    if (low > high) throw runtimeError(`the start of \`int/random\` cannot be greater than its end, got ${low} and ${high}`, context.position);
    return int(randomBetween(context.interpreter.randomness, low, high));
  });

  interpreter.defineMethodIn('math', 'abs', ['int', 'float'], 1, (inputs, context) => {
    const value = expectNumber(input(inputs, 0), 'the input of `math/abs`', context);
    return value.type === 'int' ? int(value.value < 0n ? -value.value : value.value) : float(Math.abs(value.value));
  });

  interpreter.defineMethodIn('math', 'pow', ['int', 'float'], 2, (inputs, context) => {
    const base = expectNumber(input(inputs, 0), 'the input of `math/pow`', context);
    const exponent = expectNumber(input(inputs, 1), 'the exponent of `math/pow`', context);
    if (base.type === 'int' && exponent.type === 'int' && exponent.value >= 0n) return int(intPow(base.value, exponent.value, context));
    return float(floatPow(toFloat(base, 'the input of `math/pow`', context), toFloat(exponent, 'the exponent of `math/pow`', context), context));
  });

  interpreter.defineMethodIn('math', 'sqrt', ['int', 'float'], 1, (inputs, context) => {
    const value = expectNumber(input(inputs, 0), 'the input of `math/sqrt`', context);
    if (isNegative(value)) throw runtimeError('`math/sqrt` of a negative number', context.position);
    return float(Math.sqrt(toFloat(value, 'the input of `math/sqrt`', context)));
  });

  interpreter.defineMethodIn('math', 'min', ['int', 'float'], 2, (inputs, context) => {
    const value = expectNumber(input(inputs, 0), 'the input of `math/min`', context);
    const other = expectNumber(input(inputs, 1), 'the other value of `math/min`', context);
    return compareValues(other, value, context.position) < 0 ? other : value;
  });

  interpreter.defineMethodIn('math', 'max', ['int', 'float'], 2, (inputs, context) => {
    const value = expectNumber(input(inputs, 0), 'the input of `math/max`', context);
    const other = expectNumber(input(inputs, 1), 'the other value of `math/max`', context);
    return compareValues(other, value, context.position) > 0 ? other : value;
  });

  interpreter.defineMethodIn('math', 'clamp', ['int', 'float'], 3, (inputs, context) => {
    const value = expectNumber(input(inputs, 0), 'the input of `math/clamp`', context);
    const low = expectNumber(input(inputs, 1), 'the low bound of `math/clamp`', context);
    const high = expectNumber(input(inputs, 2), 'the high bound of `math/clamp`', context);
    if (compareValues(low, high, context.position) > 0) {
      throw runtimeError(`the low bound of \`math/clamp\` must not be greater than the high bound, got ${formatValue(low, 'print')} and ${formatValue(high, 'print')}`, context.position);
    }
    if (compareValues(value, low, context.position) < 0) return low;
    if (compareValues(value, high, context.position) > 0) return high;
    return value;
  });

  interpreter.defineMethodIn('math', 'sign', ['int', 'float'], 1, (inputs, context) => {
    const value = expectNumber(input(inputs, 0), 'the input of `math/sign`', context);
    if (value.type === 'int') return int(value.value < 0n ? -1n : value.value > 0n ? 1n : 0n);
    return int(value.value < 0 ? -1n : value.value > 0 ? 1n : 0n);
  });

  interpreter.defineIn('int', 'to-string', 1, (inputs, context) => string(expectInt(input(inputs, 0), 'the input of `int/to-string`', context).toString()));
  interpreter.defineIn('float', 'to-string', 1, (inputs, context) => {
    const value = input(inputs, 0);
    if (value.type !== 'float') throw runtimeError(`the input of \`float/to-string\` must be a float, got ${describeType(value)}`, context.position);
    return string(formatValue(value, 'print'));
  });

  interpreter.defineIn('int', 'is-even', 1, (inputs, context) => boolean(expectInt(input(inputs, 0), 'the input of `int/is-even`', context) % 2n === 0n));

  interpreter.defineIn('int', 'is-odd', 1, (inputs, context) => boolean(expectInt(input(inputs, 0), 'the input of `int/is-odd`', context) % 2n !== 0n));

  interpreter.defineIn('int', 'to-float', 1, (inputs, context) => {
    const value = expectInt(input(inputs, 0), 'the input of `int/to-float`', context);
    return float(toFloat(int(value), 'the input of `int/to-float`', context));
  });

  interpreter.defineIn('int', 'to-int', 1, (inputs, context) => int(expectInt(input(inputs, 0), 'the input of `int/to-int`', context)));

  interpreter.defineIn('int', 'to-char', 1, (inputs, context) => {
    const code = expectInt(input(inputs, 0), 'the input of `int/to-char`', context);
    if (code < 0n || code > MAX_CODE_POINT) {
      throw runtimeError(`the input of \`int/to-char\` must be a code point between 0 and ${MAX_CODE_POINT}, got ${code}`, context.position);
    }
    if (code >= SURROGATE_LOW && code <= SURROGATE_HIGH) {
      throw runtimeError(`the input of \`int/to-char\` must not be a surrogate code point (${SURROGATE_LOW} to ${SURROGATE_HIGH}), got ${code}`, context.position);
    }
    return char(String.fromCodePoint(Number(code)));
  });
}
