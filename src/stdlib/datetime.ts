import { runtimeError } from '../errors.ts';
import type { CallContext, Interpreter } from '../interpreter.ts';
import { WEEKDAY_NAMES, civilFromDays, weekday } from '../runtime/calendar.ts';
import { lower } from '../runtime/text.ts';
import {
  MILLISECONDS_PER_DAY,
  MILLISECONDS_PER_HOUR,
  MILLISECONDS_PER_MINUTE,
  MILLISECONDS_PER_SECOND,
  formatDateTime,
  isoDateTime,
  parseIsoDateTime,
  splitEpochMs,
  timePartsFromMs,
} from '../runtime/time.ts';
import { date, datetime, describeType, formatValue, int, string, time, type DateTimeValue, type Value } from '../values.ts';
import { input, expectInt, expectString } from './core.ts';
import { expectDate } from './date.ts';
import { expectCount, expectTime } from './time.ts';

const MAX_EPOCH_MILLISECONDS = 1_000_000_000_000_000;

function expectDateTime(value: Value, what: string, context: CallContext): DateTimeValue {
  if (value.type !== 'datetime') throw runtimeError(`${what} must be a datetime, got ${describeType(value)}`, context.position);
  return value;
}

function receiver(inputs: Value[], name: string, context: CallContext): DateTimeValue {
  return expectDateTime(input(inputs, 0), `the input of \`datetime/${name}\``, context);
}

function inRange(milliseconds: number, context: CallContext): DateTimeValue {
  if (milliseconds > MAX_EPOCH_MILLISECONDS || milliseconds < -MAX_EPOCH_MILLISECONDS) throw runtimeError('the resulting datetime is out of range', context.position);
  return datetime(milliseconds);
}

function calendarPart(value: DateTimeValue): { year: number; month: number; day: number; days: number; millisecondsOfDay: number } {
  const { days, millisecondsOfDay: dayMilliseconds } = splitEpochMs(value.milliseconds);
  const civil = civilFromDays(days);
  return { ...civil, days, millisecondsOfDay: dayMilliseconds };
}

function shift(name: string, unit: number, interpreter: Interpreter): void {
  interpreter.defineIn('datetime', name, 2, (inputs, context) => {
    const value = receiver(inputs, name, context);
    const count = expectCount(input(inputs, 1), `the count of \`datetime/${name}\``, `${name.slice(4, -1)} count`, context);
    return inRange(value.milliseconds + count * unit, context);
  });
}

function between(name: string, unit: number, interpreter: Interpreter): void {
  interpreter.defineIn('datetime', name, 2, (inputs, context) => {
    const start = receiver(inputs, name, context);
    const end = expectDateTime(input(inputs, 1), `the end of \`datetime/${name}\``, context);
    return int(BigInt(Math.floor((end.milliseconds - start.milliseconds) / unit)));
  });
}

export function registerDatetime(interpreter: Interpreter): void {
  interpreter.defineIn('datetime', 'now', 0, () => datetime(Date.now()));

  interpreter.defineIn('date', 'at-time', 2, (inputs, context) => {
    const day = expectDate(input(inputs, 0), 'the input of `date/at-time`', context);
    const clock = expectTime(input(inputs, 1), 'the time of `date/at-time`', context);
    return inRange(day.days * MILLISECONDS_PER_DAY + clock.milliseconds, context);
  });

  interpreter.defineIn('datetime', 'parse', 1, (inputs, context) => {
    const text = expectString(input(inputs, 0), 'the input of `datetime/parse`', context);
    const milliseconds = parseIsoDateTime(text);
    if (milliseconds === null) throw runtimeError(`cannot convert ${formatValue(input(inputs, 0), 'show')} to a datetime`, context.position);
    return inRange(milliseconds, context);
  });

  interpreter.defineIn('datetime', 'from-epoch', 1, (inputs, context) => {
    const milliseconds = expectInt(input(inputs, 0), 'the input of `datetime/from-epoch`', context);
    if (milliseconds > BigInt(MAX_EPOCH_MILLISECONDS) || milliseconds < -BigInt(MAX_EPOCH_MILLISECONDS)) throw runtimeError(`epoch milliseconds ${milliseconds} is out of range`, context.position);
    return datetime(Number(milliseconds));
  });

  interpreter.defineIn('datetime', 'date', 1, (inputs, context) => date(splitEpochMs(receiver(inputs, 'date', context).milliseconds).days));
  interpreter.defineIn('datetime', 'time', 1, (inputs, context) => time(splitEpochMs(receiver(inputs, 'time', context).milliseconds).millisecondsOfDay));
  interpreter.defineIn('datetime', 'start-of-day', 1, (inputs, context) => datetime(splitEpochMs(receiver(inputs, 'start-of-day', context).milliseconds).days * MILLISECONDS_PER_DAY));
  interpreter.defineIn('datetime', 'epoch-milliseconds', 1, (inputs, context) => int(BigInt(receiver(inputs, 'epoch-milliseconds', context).milliseconds)));

  interpreter.defineIn('datetime', 'year', 1, (inputs, context) => int(BigInt(calendarPart(receiver(inputs, 'year', context)).year)));
  interpreter.defineIn('datetime', 'month', 1, (inputs, context) => int(BigInt(calendarPart(receiver(inputs, 'month', context)).month)));
  interpreter.defineIn('datetime', 'day', 1, (inputs, context) => int(BigInt(calendarPart(receiver(inputs, 'day', context)).day)));
  interpreter.defineIn('datetime', 'weekday', 1, (inputs, context) => {
    const name = WEEKDAY_NAMES[weekday(calendarPart(receiver(inputs, 'weekday', context)).days) - 1];
    if (name === undefined) throw runtimeError('internal: weekday out of range', context.position);
    return string(lower(name));
  });
  interpreter.defineIn('datetime', 'weekday-number', 1, (inputs, context) => int(BigInt(weekday(calendarPart(receiver(inputs, 'weekday-number', context)).days))));
  interpreter.defineIn('datetime', 'hour', 1, (inputs, context) => int(BigInt(timePartsFromMs(calendarPart(receiver(inputs, 'hour', context)).millisecondsOfDay).hour)));
  interpreter.defineIn('datetime', 'minute', 1, (inputs, context) => int(BigInt(timePartsFromMs(calendarPart(receiver(inputs, 'minute', context)).millisecondsOfDay).minute)));
  interpreter.defineIn('datetime', 'second', 1, (inputs, context) => int(BigInt(timePartsFromMs(calendarPart(receiver(inputs, 'second', context)).millisecondsOfDay).second)));
  interpreter.defineIn('datetime', 'millisecond', 1, (inputs, context) => int(BigInt(timePartsFromMs(calendarPart(receiver(inputs, 'millisecond', context)).millisecondsOfDay).millisecond)));

  shift('add-days', MILLISECONDS_PER_DAY, interpreter);
  shift('add-hours', MILLISECONDS_PER_HOUR, interpreter);
  shift('add-minutes', MILLISECONDS_PER_MINUTE, interpreter);
  shift('add-seconds', MILLISECONDS_PER_SECOND, interpreter);
  shift('add-milliseconds', 1, interpreter);

  between('days-between', MILLISECONDS_PER_DAY, interpreter);
  between('seconds-between', MILLISECONDS_PER_SECOND, interpreter);
  between('milliseconds-between', 1, interpreter);

  interpreter.defineIn('datetime', 'format', 2, (inputs, context) => {
    const value = receiver(inputs, 'format', context);
    const pattern = expectString(input(inputs, 1), 'the pattern of `datetime/format`', context);
    return string(formatDateTime(value.milliseconds, pattern));
  });

  interpreter.defineIn('datetime', 'to-string', 1, (inputs, context) => string(isoDateTime(receiver(inputs, 'to-string', context).milliseconds)));
}
