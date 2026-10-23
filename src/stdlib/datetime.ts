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
  return expectDateTime(input(inputs, 0), `the input of \`${name}\``, context);
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
  interpreter.defineMethod(name, 'datetime', 2, (inputs, context) => {
    const value = receiver(inputs, name, context);
    const count = expectCount(input(inputs, 1), `the count of \`${name}\``, `${name.slice(4, -1)} count`, context);
    return inRange(value.milliseconds + count * unit, context);
  });
}

function between(name: string, unit: number, interpreter: Interpreter): void {
  interpreter.defineMethod(name, 'datetime', 2, (inputs, context) => {
    const start = receiver(inputs, name, context);
    const end = expectDateTime(input(inputs, 1), `the end of \`${name}\``, context);
    return int(BigInt(Math.floor((end.milliseconds - start.milliseconds) / unit)));
  });
}

export function registerDatetime(interpreter: Interpreter): void {
  interpreter.defineBuiltin('now', 0, () => datetime(Date.now()));

  interpreter.defineMethod('at-time', 'date', 2, (inputs, context) => {
    const day = expectDate(input(inputs, 0), 'the input of `at-time`', context);
    const clock = expectTime(input(inputs, 1), 'the time of `at-time`', context);
    return inRange(day.days * MILLISECONDS_PER_DAY + clock.milliseconds, context);
  });

  interpreter.defineMethod('to-datetime', 'string', 1, (inputs, context) => {
    const text = expectString(input(inputs, 0), 'the input of `to-datetime`', context);
    const milliseconds = parseIsoDateTime(text);
    if (milliseconds === null) throw runtimeError(`cannot convert ${formatValue(input(inputs, 0), 'show')} to a datetime`, context.position);
    return inRange(milliseconds, context);
  });

  interpreter.defineMethod('to-datetime', 'int', 1, (inputs, context) => {
    const milliseconds = expectInt(input(inputs, 0), 'the input of `to-datetime`', context);
    if (milliseconds > BigInt(MAX_EPOCH_MILLISECONDS) || milliseconds < -BigInt(MAX_EPOCH_MILLISECONDS)) throw runtimeError(`epoch milliseconds ${milliseconds} is out of range`, context.position);
    return datetime(Number(milliseconds));
  });

  interpreter.defineMethod('date', 'datetime', 1, (inputs, context) => date(splitEpochMs(receiver(inputs, 'date', context).milliseconds).days));
  interpreter.defineMethod('time', 'datetime', 1, (inputs, context) => time(splitEpochMs(receiver(inputs, 'time', context).milliseconds).millisecondsOfDay));
  interpreter.defineMethod('start-of-day', 'datetime', 1, (inputs, context) => datetime(splitEpochMs(receiver(inputs, 'start-of-day', context).milliseconds).days * MILLISECONDS_PER_DAY));
  interpreter.defineMethod('epoch-milliseconds', 'datetime', 1, (inputs, context) => int(BigInt(receiver(inputs, 'epoch-milliseconds', context).milliseconds)));

  interpreter.defineMethod('year', 'datetime', 1, (inputs, context) => int(BigInt(calendarPart(receiver(inputs, 'year', context)).year)));
  interpreter.defineMethod('month', 'datetime', 1, (inputs, context) => int(BigInt(calendarPart(receiver(inputs, 'month', context)).month)));
  interpreter.defineMethod('day', 'datetime', 1, (inputs, context) => int(BigInt(calendarPart(receiver(inputs, 'day', context)).day)));
  interpreter.defineMethod('weekday', 'datetime', 1, (inputs, context) => {
    const name = WEEKDAY_NAMES[weekday(calendarPart(receiver(inputs, 'weekday', context)).days) - 1];
    if (name === undefined) throw runtimeError('internal: weekday out of range', context.position);
    return string(lower(name));
  });
  interpreter.defineMethod('weekday-number', 'datetime', 1, (inputs, context) => int(BigInt(weekday(calendarPart(receiver(inputs, 'weekday-number', context)).days))));
  interpreter.defineMethod('hour', 'datetime', 1, (inputs, context) => int(BigInt(timePartsFromMs(calendarPart(receiver(inputs, 'hour', context)).millisecondsOfDay).hour)));
  interpreter.defineMethod('minute', 'datetime', 1, (inputs, context) => int(BigInt(timePartsFromMs(calendarPart(receiver(inputs, 'minute', context)).millisecondsOfDay).minute)));
  interpreter.defineMethod('second', 'datetime', 1, (inputs, context) => int(BigInt(timePartsFromMs(calendarPart(receiver(inputs, 'second', context)).millisecondsOfDay).second)));
  interpreter.defineMethod('millisecond', 'datetime', 1, (inputs, context) => int(BigInt(timePartsFromMs(calendarPart(receiver(inputs, 'millisecond', context)).millisecondsOfDay).millisecond)));

  shift('add-days', MILLISECONDS_PER_DAY, interpreter);
  shift('add-hours', MILLISECONDS_PER_HOUR, interpreter);
  shift('add-minutes', MILLISECONDS_PER_MINUTE, interpreter);
  shift('add-seconds', MILLISECONDS_PER_SECOND, interpreter);
  shift('add-milliseconds', 1, interpreter);

  between('days-between', MILLISECONDS_PER_DAY, interpreter);
  between('seconds-between', MILLISECONDS_PER_SECOND, interpreter);
  between('milliseconds-between', 1, interpreter);

  interpreter.defineMethod('format', 'datetime', 2, (inputs, context) => {
    const value = receiver(inputs, 'format', context);
    const pattern = expectString(input(inputs, 1), 'the pattern of `format`', context);
    return string(formatDateTime(value.milliseconds, pattern));
  });

  interpreter.defineMethod('to-string', 'datetime', 1, (inputs, context) => string(isoDateTime(receiver(inputs, 'to-string', context).milliseconds)));
}
