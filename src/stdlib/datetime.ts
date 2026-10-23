import { runtimeError } from '../errors.ts';
import type { CallContext, Interpreter } from '../interpreter.ts';
import { WEEKDAY_NAMES, civilFromDays, weekday } from '../runtime/calendar.ts';
import { lower } from '../runtime/text.ts';
import {
  MS_PER_DAY,
  MS_PER_HOUR,
  MS_PER_MINUTE,
  MS_PER_SECOND,
  formatDateTime,
  isoDateTime,
  parseIsoDateTime,
  splitEpochMs,
  timePartsFromMs,
} from '../runtime/time.ts';
import { date, datetime, describeType, formatValue, int, str, time, type DateTimeValue, type Value } from '../values.ts';
import { arg, expectInt, expectString } from './core.ts';
import { expectDate } from './date.ts';
import { expectCount, expectTime } from './time.ts';

const MAX_EPOCH_MS = 1_000_000_000_000_000;

function expectDateTime(value: Value, what: string, ctx: CallContext): DateTimeValue {
  if (value.t !== 'datetime') throw runtimeError(`${what} must be a datetime, got ${describeType(value)}`, ctx.pos);
  return value;
}

function receiver(args: Value[], name: string, ctx: CallContext): DateTimeValue {
  return expectDateTime(arg(args, 0), `the input of \`${name}\``, ctx);
}

function inRange(ms: number, ctx: CallContext): DateTimeValue {
  if (ms > MAX_EPOCH_MS || ms < -MAX_EPOCH_MS) throw runtimeError('the resulting datetime is out of range', ctx.pos);
  return datetime(ms);
}

function calendarPart(value: DateTimeValue): { year: number; month: number; day: number; days: number; msOfDay: number } {
  const { days, msOfDay } = splitEpochMs(value.ms);
  const civil = civilFromDays(days);
  return { ...civil, days, msOfDay };
}

function shift(name: string, unit: number, interp: Interpreter): void {
  interp.defineMethod(name, 'datetime', 2, (args, ctx) => {
    const value = receiver(args, name, ctx);
    const count = expectCount(arg(args, 1), `the count of \`${name}\``, `${name.slice(4, -1)} count`, ctx);
    return inRange(value.ms + count * unit, ctx);
  });
}

function between(name: string, unit: number, interp: Interpreter): void {
  interp.defineMethod(name, 'datetime', 2, (args, ctx) => {
    const start = receiver(args, name, ctx);
    const end = expectDateTime(arg(args, 1), `the end of \`${name}\``, ctx);
    return int(BigInt(Math.floor((end.ms - start.ms) / unit)));
  });
}

export function registerDatetime(interp: Interpreter): void {
  interp.defineBuiltin('now', 0, () => datetime(Date.now()));

  interp.defineMethod('at-time', 'date', 2, (args, ctx) => {
    const day = expectDate(arg(args, 0), 'the input of `at-time`', ctx);
    const clock = expectTime(arg(args, 1), 'the time of `at-time`', ctx);
    return inRange(day.days * MS_PER_DAY + clock.ms, ctx);
  });

  interp.defineMethod('to-datetime', 'string', 1, (args, ctx) => {
    const text = expectString(arg(args, 0), 'the input of `to-datetime`', ctx);
    const ms = parseIsoDateTime(text);
    if (ms === null) throw runtimeError(`cannot convert ${formatValue(arg(args, 0), 'show')} to a datetime`, ctx.pos);
    return inRange(ms, ctx);
  });

  interp.defineMethod('to-datetime', 'int', 1, (args, ctx) => {
    const ms = expectInt(arg(args, 0), 'the input of `to-datetime`', ctx);
    if (ms > BigInt(MAX_EPOCH_MS) || ms < -BigInt(MAX_EPOCH_MS)) throw runtimeError(`epoch milliseconds ${ms} is out of range`, ctx.pos);
    return datetime(Number(ms));
  });

  interp.defineMethod('date', 'datetime', 1, (args, ctx) => date(splitEpochMs(receiver(args, 'date', ctx).ms).days));
  interp.defineMethod('time', 'datetime', 1, (args, ctx) => time(splitEpochMs(receiver(args, 'time', ctx).ms).msOfDay));
  interp.defineMethod('start-of-day', 'datetime', 1, (args, ctx) => datetime(splitEpochMs(receiver(args, 'start-of-day', ctx).ms).days * MS_PER_DAY));
  interp.defineMethod('epoch-milliseconds', 'datetime', 1, (args, ctx) => int(BigInt(receiver(args, 'epoch-milliseconds', ctx).ms)));

  interp.defineMethod('year', 'datetime', 1, (args, ctx) => int(BigInt(calendarPart(receiver(args, 'year', ctx)).year)));
  interp.defineMethod('month', 'datetime', 1, (args, ctx) => int(BigInt(calendarPart(receiver(args, 'month', ctx)).month)));
  interp.defineMethod('day', 'datetime', 1, (args, ctx) => int(BigInt(calendarPart(receiver(args, 'day', ctx)).day)));
  interp.defineMethod('weekday', 'datetime', 1, (args, ctx) => {
    const name = WEEKDAY_NAMES[weekday(calendarPart(receiver(args, 'weekday', ctx)).days) - 1];
    if (name === undefined) throw runtimeError('internal: weekday out of range', ctx.pos);
    return str(lower(name));
  });
  interp.defineMethod('weekday-number', 'datetime', 1, (args, ctx) => int(BigInt(weekday(calendarPart(receiver(args, 'weekday-number', ctx)).days))));
  interp.defineMethod('hour', 'datetime', 1, (args, ctx) => int(BigInt(timePartsFromMs(calendarPart(receiver(args, 'hour', ctx)).msOfDay).hour)));
  interp.defineMethod('minute', 'datetime', 1, (args, ctx) => int(BigInt(timePartsFromMs(calendarPart(receiver(args, 'minute', ctx)).msOfDay).minute)));
  interp.defineMethod('second', 'datetime', 1, (args, ctx) => int(BigInt(timePartsFromMs(calendarPart(receiver(args, 'second', ctx)).msOfDay).second)));
  interp.defineMethod('millisecond', 'datetime', 1, (args, ctx) => int(BigInt(timePartsFromMs(calendarPart(receiver(args, 'millisecond', ctx)).msOfDay).millisecond)));

  shift('add-days', MS_PER_DAY, interp);
  shift('add-hours', MS_PER_HOUR, interp);
  shift('add-minutes', MS_PER_MINUTE, interp);
  shift('add-seconds', MS_PER_SECOND, interp);
  shift('add-milliseconds', 1, interp);

  between('days-between', MS_PER_DAY, interp);
  between('seconds-between', MS_PER_SECOND, interp);
  between('milliseconds-between', 1, interp);

  interp.defineMethod('format', 'datetime', 2, (args, ctx) => {
    const value = receiver(args, 'format', ctx);
    const pattern = expectString(arg(args, 1), 'the pattern of `format`', ctx);
    return str(formatDateTime(value.ms, pattern));
  });

  interp.defineMethod('to-string', 'datetime', 1, (args, ctx) => str(isoDateTime(receiver(args, 'to-string', ctx).ms)));
}
