import { runtimeError } from '../errors.ts';
import type { CallContext, Interpreter } from '../interpreter.ts';
import {
  MONTH_NAMES,
  WEEKDAY_NAMES,
  addMonths,
  civilFromDays,
  dayOfYear,
  daysFromCivil,
  daysInMonth,
  formatDate,
  isLeapYear,
  isValidDate,
  parseIsoDate,
  weekday,
  type CivilDate,
} from '../runtime/calendar.ts';
import { lower, padStart } from '../runtime/text.ts';
import { boolean, date, describeType, formatDateValue, formatValue, int, string, type DateValue, type Value } from '../values.ts';
import { input, expectInt, expectString } from './core.ts';

const MILLISECONDS_PER_DAY = 86_400_000;
const MAX_MAGNITUDE = 1_000_000_000n;

export function expectDate(value: Value, what: string, context: CallContext): DateValue {
  if (value.type !== 'date') throw runtimeError(`${what} must be a date, got ${describeType(value)}`, context.position);
  return value;
}

function expectSmallInt(value: Value, what: string, noun: string, context: CallContext): number {
  const big = expectInt(value, what, context);
  if (big > MAX_MAGNITUDE || big < -MAX_MAGNITUDE) throw runtimeError(`${noun} ${big} is out of range`, context.position);
  return Number(big);
}

function civil(value: DateValue): CivilDate {
  return civilFromDays(value.days);
}

function fromCivil(parts: CivilDate): DateValue {
  return date(daysFromCivil(parts.year, parts.month, parts.day));
}

function zeroPadded(value: number, width: number): string {
  const sign = value < 0 ? '-' : '';
  return sign + padStart(String(Math.abs(value)), width, '0');
}

function describeComponents(year: number, month: number, day: number): string {
  return `${zeroPadded(year, 4)}-${zeroPadded(month, 2)}-${zeroPadded(day, 2)}`;
}

function lowerName(names: readonly string[], index: number): string {
  const name = names[index];
  if (name === undefined) throw new RangeError(`no calendar name at index ${index}`);
  return lower(name);
}

export function registerDate(interpreter: Interpreter): void {
  interpreter.defineBuiltin('today', 0, () => date(Math.floor(Date.now() / MILLISECONDS_PER_DAY)));

  interpreter.defineMethod('date', 'int', 3, (inputs, context) => {
    const year = expectSmallInt(input(inputs, 0), 'the year of `date`', 'year', context);
    const month = expectSmallInt(input(inputs, 1), 'the month of `date`', 'month', context);
    const day = expectSmallInt(input(inputs, 2), 'the day of `date`', 'day', context);
    if (!isValidDate(year, month, day)) throw runtimeError(`${describeComponents(year, month, day)} is not a valid date`, context.position);
    return date(daysFromCivil(year, month, day));
  });

  interpreter.defineMethod('to-date', 'string', 1, (inputs, context) => {
    const text = expectString(input(inputs, 0), 'the input of `to-date`', context);
    const parsed = parseIsoDate(text);
    if (parsed === null) throw runtimeError(`cannot convert ${formatValue(input(inputs, 0), 'show')} to a date`, context.position);
    return fromCivil(parsed);
  });

  interpreter.defineMethod('year', 'date', 1, (inputs, context) => int(BigInt(civil(expectDate(input(inputs, 0), 'the input of `year`', context)).year)));

  interpreter.defineMethod('month', 'date', 1, (inputs, context) => int(BigInt(civil(expectDate(input(inputs, 0), 'the input of `month`', context)).month)));

  interpreter.defineMethod('day', 'date', 1, (inputs, context) => int(BigInt(civil(expectDate(input(inputs, 0), 'the input of `day`', context)).day)));

  interpreter.defineMethod('weekday', 'date', 1, (inputs, context) => {
    const value = expectDate(input(inputs, 0), 'the input of `weekday`', context);
    return string(lowerName(WEEKDAY_NAMES, weekday(value.days) - 1));
  });

  interpreter.defineMethod('weekday-number', 'date', 1, (inputs, context) => {
    const value = expectDate(input(inputs, 0), 'the input of `weekday-number`', context);
    return int(BigInt(weekday(value.days)));
  });

  interpreter.defineMethod('month-name', 'date', 1, (inputs, context) => {
    const parts = civil(expectDate(input(inputs, 0), 'the input of `month-name`', context));
    return string(lowerName(MONTH_NAMES, parts.month - 1));
  });

  interpreter.defineMethod('day-of-year', 'date', 1, (inputs, context) => {
    const parts = civil(expectDate(input(inputs, 0), 'the input of `day-of-year`', context));
    return int(BigInt(dayOfYear(parts.year, parts.month, parts.day)));
  });

  interpreter.defineMethod('is-leap-year', ['date', 'int'], 1, (inputs, context) => {
    const given = input(inputs, 0);
    const year = given.type === 'date' ? civil(given).year : expectSmallInt(given, 'the given of `is-leap-year`', 'year', context);
    return boolean(isLeapYear(year));
  });

  interpreter.defineMethod('add-days', 'date', 2, (inputs, context) => {
    const value = expectDate(input(inputs, 0), 'the input of `add-days`', context);
    const count = expectSmallInt(input(inputs, 1), 'the count of `add-days`', 'day count', context);
    return date(value.days + count);
  });

  interpreter.defineMethod('add-months', 'date', 2, (inputs, context) => {
    const parts = civil(expectDate(input(inputs, 0), 'the input of `add-months`', context));
    const count = expectSmallInt(input(inputs, 1), 'the count of `add-months`', 'month count', context);
    return fromCivil(addMonths(parts.year, parts.month, parts.day, count));
  });

  interpreter.defineMethod('add-years', 'date', 2, (inputs, context) => {
    const parts = civil(expectDate(input(inputs, 0), 'the input of `add-years`', context));
    const count = expectSmallInt(input(inputs, 1), 'the count of `add-years`', 'year count', context);
    return fromCivil(addMonths(parts.year, parts.month, parts.day, count * 12));
  });

  interpreter.defineMethod('days-between', 'date', 2, (inputs, context) => {
    const start = expectDate(input(inputs, 0), 'the input of `days-between`', context);
    const end = expectDate(input(inputs, 1), 'the end of `days-between`', context);
    return int(BigInt(end.days - start.days));
  });

  interpreter.defineMethod('days-in-month', 'date', 1, (inputs, context) => {
    const parts = civil(expectDate(input(inputs, 0), 'the input of `days-in-month`', context));
    return int(BigInt(daysInMonth(parts.year, parts.month)));
  });

  interpreter.defineMethod('start-of-month', 'date', 1, (inputs, context) => {
    const parts = civil(expectDate(input(inputs, 0), 'the input of `start-of-month`', context));
    return fromCivil({ year: parts.year, month: parts.month, day: 1 });
  });

  interpreter.defineMethod('end-of-month', 'date', 1, (inputs, context) => {
    const parts = civil(expectDate(input(inputs, 0), 'the input of `end-of-month`', context));
    return fromCivil({ year: parts.year, month: parts.month, day: daysInMonth(parts.year, parts.month) });
  });

  interpreter.defineMethod('format', 'date', 2, (inputs, context) => {
    const parts = civil(expectDate(input(inputs, 0), 'the input of `format`', context));
    const pattern = expectString(input(inputs, 1), 'the pattern of `format`', context);
    return string(formatDate(parts, pattern));
  });

  interpreter.defineMethod('to-string', 'date', 1, (inputs, context) => string(formatDateValue(expectDate(input(inputs, 0), 'the input of `to-string`', context))));
}
