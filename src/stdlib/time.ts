import { runtimeError } from '../errors.ts';
import type { CallContext, Interpreter } from '../interpreter.ts';
import { padStart } from '../runtime/text.ts';
import {
  MILLISECONDS_PER_HOUR,
  MILLISECONDS_PER_MINUTE,
  MILLISECONDS_PER_SECOND,
  formatTime,
  isValidTime,
  isoTime,
  millisecondsFromTimeParts,
  parseIsoTime,
  timePartsFromMs,
  wrapIntoDay,
} from '../runtime/time.ts';
import { describeType, formatValue, int, string, time, type TimeValue, type Value } from '../values.ts';
import { input, expectInt, expectString } from './core.ts';

const MAX_COUNT = 1_000_000_000_000_000n;
const MAX_COMPONENT = 1_000_000_000n;

export function expectTime(value: Value, what: string, context: CallContext): TimeValue {
  if (value.type !== 'time') throw runtimeError(`${what} must be a time, got ${describeType(value)}`, context.position);
  return value;
}

export function expectCount(value: Value, what: string, noun: string, context: CallContext): number {
  const big = expectInt(value, what, context);
  if (big > MAX_COUNT || big < -MAX_COUNT) throw runtimeError(`${noun} ${big} is out of range`, context.position);
  return Number(big);
}

function expectComponent(value: Value, what: string, noun: string, context: CallContext): number {
  const big = expectInt(value, what, context);
  if (big > MAX_COMPONENT || big < -MAX_COMPONENT) throw runtimeError(`${noun} ${big} is out of range`, context.position);
  return Number(big);
}

function describeTime(hour: number, minute: number, second: number, millisecond: number): string {
  const base = `${padStart(String(hour), 2, '0')}:${padStart(String(minute), 2, '0')}:${padStart(String(second), 2, '0')}`;
  return millisecond === 0 ? base : `${base}.${padStart(String(millisecond), 3, '0')}`;
}

function receiver(inputs: Value[], name: string, context: CallContext): TimeValue {
  return expectTime(input(inputs, 0), `the input of \`${name}\``, context);
}

function shift(name: string, unit: number, interpreter: Interpreter): void {
  interpreter.defineMethod(name, 'time', 2, (inputs, context) => {
    const value = receiver(inputs, name, context);
    const count = expectCount(input(inputs, 1), `the count of \`${name}\``, `${name.slice(4, -1)} count`, context);
    return time(wrapIntoDay(value.milliseconds + count * unit));
  });
}

export function registerTime(interpreter: Interpreter): void {
  interpreter.defineMethod('time', 'int', { min: 3, max: 4 }, (inputs, context) => {
    const hour = expectComponent(input(inputs, 0), 'the hour of `time`', 'hour', context);
    const minute = expectComponent(input(inputs, 1), 'the minute of `time`', 'minute', context);
    const second = expectComponent(input(inputs, 2), 'the second of `time`', 'second', context);
    const millisecond = inputs.length > 3 ? expectComponent(input(inputs, 3), 'the millisecond of `time`', 'millisecond', context) : 0;
    if (!isValidTime(hour, minute, second, millisecond)) {
      throw runtimeError(`${describeTime(hour, minute, second, millisecond)} is not a valid time`, context.position);
    }
    return time(millisecondsFromTimeParts({ hour, minute, second, millisecond }));
  });

  interpreter.defineMethod('to-time', 'string', 1, (inputs, context) => {
    const text = expectString(input(inputs, 0), 'the input of `to-time`', context);
    const milliseconds = parseIsoTime(text);
    if (milliseconds === null) throw runtimeError(`cannot convert ${formatValue(input(inputs, 0), 'show')} to a time`, context.position);
    return time(milliseconds);
  });

  interpreter.defineMethod('hour', 'time', 1, (inputs, context) => int(BigInt(timePartsFromMs(receiver(inputs, 'hour', context).milliseconds).hour)));
  interpreter.defineMethod('minute', 'time', 1, (inputs, context) => int(BigInt(timePartsFromMs(receiver(inputs, 'minute', context).milliseconds).minute)));
  interpreter.defineMethod('second', 'time', 1, (inputs, context) => int(BigInt(timePartsFromMs(receiver(inputs, 'second', context).milliseconds).second)));
  interpreter.defineMethod('millisecond', 'time', 1, (inputs, context) => int(BigInt(timePartsFromMs(receiver(inputs, 'millisecond', context).milliseconds).millisecond)));
  interpreter.defineMethod('to-milliseconds', 'time', 1, (inputs, context) => int(BigInt(receiver(inputs, 'to-milliseconds', context).milliseconds)));

  shift('add-hours', MILLISECONDS_PER_HOUR, interpreter);
  shift('add-minutes', MILLISECONDS_PER_MINUTE, interpreter);
  shift('add-seconds', MILLISECONDS_PER_SECOND, interpreter);
  shift('add-milliseconds', 1, interpreter);

  interpreter.defineMethod('milliseconds-between', 'time', 2, (inputs, context) => {
    const start = receiver(inputs, 'milliseconds-between', context);
    const end = expectTime(input(inputs, 1), 'the end of `milliseconds-between`', context);
    return int(BigInt(end.milliseconds - start.milliseconds));
  });

  interpreter.defineMethod('seconds-between', 'time', 2, (inputs, context) => {
    const start = receiver(inputs, 'seconds-between', context);
    const end = expectTime(input(inputs, 1), 'the end of `seconds-between`', context);
    return int(BigInt(Math.floor((end.milliseconds - start.milliseconds) / MILLISECONDS_PER_SECOND)));
  });

  interpreter.defineMethod('format', 'time', 2, (inputs, context) => {
    const value = receiver(inputs, 'format', context);
    const pattern = expectString(input(inputs, 1), 'the pattern of `format`', context);
    return string(formatTime(value.milliseconds, pattern));
  });

  interpreter.defineMethod('to-string', 'time', 1, (inputs, context) => string(isoTime(receiver(inputs, 'to-string', context).milliseconds)));
}
