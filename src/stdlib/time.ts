import { runtimeError } from '../errors.ts';
import type { CallContext, Interpreter } from '../interpreter.ts';
import { padStart } from '../runtime/text.ts';
import {
  MS_PER_HOUR,
  MS_PER_MINUTE,
  MS_PER_SECOND,
  formatTime,
  isValidTime,
  isoTime,
  msFromTimeParts,
  parseIsoTime,
  timePartsFromMs,
  wrapIntoDay,
} from '../runtime/time.ts';
import { describeType, formatValue, int, str, time, type TimeValue, type Value } from '../values.ts';
import { arg, expectInt, expectString } from './core.ts';

const MAX_COUNT = 1_000_000_000_000_000n;
const MAX_COMPONENT = 1_000_000_000n;

export function expectTime(value: Value, what: string, ctx: CallContext): TimeValue {
  if (value.t !== 'time') throw runtimeError(`${what} must be a time, got ${describeType(value)}`, ctx.pos);
  return value;
}

export function expectCount(value: Value, what: string, noun: string, ctx: CallContext): number {
  const big = expectInt(value, what, ctx);
  if (big > MAX_COUNT || big < -MAX_COUNT) throw runtimeError(`${noun} ${big} is out of range`, ctx.pos);
  return Number(big);
}

function expectComponent(value: Value, what: string, noun: string, ctx: CallContext): number {
  const big = expectInt(value, what, ctx);
  if (big > MAX_COMPONENT || big < -MAX_COMPONENT) throw runtimeError(`${noun} ${big} is out of range`, ctx.pos);
  return Number(big);
}

function describeTime(hour: number, minute: number, second: number, millisecond: number): string {
  const base = `${padStart(String(hour), 2, '0')}:${padStart(String(minute), 2, '0')}:${padStart(String(second), 2, '0')}`;
  return millisecond === 0 ? base : `${base}.${padStart(String(millisecond), 3, '0')}`;
}

function receiver(args: Value[], name: string, ctx: CallContext): TimeValue {
  return expectTime(arg(args, 0), `the input of \`${name}\``, ctx);
}

function shift(name: string, unit: number, interp: Interpreter): void {
  interp.defineMethod(name, 'time', 2, (args, ctx) => {
    const value = receiver(args, name, ctx);
    const count = expectCount(arg(args, 1), `the count of \`${name}\``, `${name.slice(4, -1)} count`, ctx);
    return time(wrapIntoDay(value.ms + count * unit));
  });
}

export function registerTime(interp: Interpreter): void {
  interp.defineMethod('time', 'int', { min: 3, max: 4 }, (args, ctx) => {
    const hour = expectComponent(arg(args, 0), 'the hour of `time`', 'hour', ctx);
    const minute = expectComponent(arg(args, 1), 'the minute of `time`', 'minute', ctx);
    const second = expectComponent(arg(args, 2), 'the second of `time`', 'second', ctx);
    const millisecond = args.length > 3 ? expectComponent(arg(args, 3), 'the millisecond of `time`', 'millisecond', ctx) : 0;
    if (!isValidTime(hour, minute, second, millisecond)) {
      throw runtimeError(`${describeTime(hour, minute, second, millisecond)} is not a valid time`, ctx.pos);
    }
    return time(msFromTimeParts({ hour, minute, second, millisecond }));
  });

  interp.defineMethod('to-time', 'string', 1, (args, ctx) => {
    const text = expectString(arg(args, 0), 'the input of `to-time`', ctx);
    const ms = parseIsoTime(text);
    if (ms === null) throw runtimeError(`cannot convert ${formatValue(arg(args, 0), 'show')} to a time`, ctx.pos);
    return time(ms);
  });

  interp.defineMethod('hour', 'time', 1, (args, ctx) => int(BigInt(timePartsFromMs(receiver(args, 'hour', ctx).ms).hour)));
  interp.defineMethod('minute', 'time', 1, (args, ctx) => int(BigInt(timePartsFromMs(receiver(args, 'minute', ctx).ms).minute)));
  interp.defineMethod('second', 'time', 1, (args, ctx) => int(BigInt(timePartsFromMs(receiver(args, 'second', ctx).ms).second)));
  interp.defineMethod('millisecond', 'time', 1, (args, ctx) => int(BigInt(timePartsFromMs(receiver(args, 'millisecond', ctx).ms).millisecond)));
  interp.defineMethod('to-milliseconds', 'time', 1, (args, ctx) => int(BigInt(receiver(args, 'to-milliseconds', ctx).ms)));

  shift('add-hours', MS_PER_HOUR, interp);
  shift('add-minutes', MS_PER_MINUTE, interp);
  shift('add-seconds', MS_PER_SECOND, interp);
  shift('add-milliseconds', 1, interp);

  interp.defineMethod('milliseconds-between', 'time', 2, (args, ctx) => {
    const start = receiver(args, 'milliseconds-between', ctx);
    const end = expectTime(arg(args, 1), 'the end of `milliseconds-between`', ctx);
    return int(BigInt(end.ms - start.ms));
  });

  interp.defineMethod('seconds-between', 'time', 2, (args, ctx) => {
    const start = receiver(args, 'seconds-between', ctx);
    const end = expectTime(arg(args, 1), 'the end of `seconds-between`', ctx);
    return int(BigInt(Math.floor((end.ms - start.ms) / MS_PER_SECOND)));
  });

  interp.defineMethod('format', 'time', 2, (args, ctx) => {
    const value = receiver(args, 'format', ctx);
    const pattern = expectString(arg(args, 1), 'the pattern of `format`', ctx);
    return str(formatTime(value.ms, pattern));
  });

  interp.defineMethod('to-string', 'time', 1, (args, ctx) => str(isoTime(receiver(args, 'to-string', ctx).ms)));
}
