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
import { bool, date, describeType, formatDateValue, formatValue, int, str, type DateValue, type Value } from '../values.ts';
import { arg, expectInt, expectString } from './core.ts';

const MS_PER_DAY = 86_400_000;
const MAX_MAGNITUDE = 1_000_000_000n;

export function expectDate(value: Value, what: string, ctx: CallContext): DateValue {
  if (value.t !== 'date') throw runtimeError(`${what} must be a date, got ${describeType(value)}`, ctx.pos);
  return value;
}

function expectSmallInt(value: Value, what: string, noun: string, ctx: CallContext): number {
  const big = expectInt(value, what, ctx);
  if (big > MAX_MAGNITUDE || big < -MAX_MAGNITUDE) throw runtimeError(`${noun} ${big} is out of range`, ctx.pos);
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

export function registerDate(interp: Interpreter): void {
  interp.defineBuiltin('today', 0, () => date(Math.floor(Date.now() / MS_PER_DAY)));

  interp.defineMethod('date', 'int', 3, (args, ctx) => {
    const year = expectSmallInt(arg(args, 0), 'the year of `date`', 'year', ctx);
    const month = expectSmallInt(arg(args, 1), 'the month of `date`', 'month', ctx);
    const day = expectSmallInt(arg(args, 2), 'the day of `date`', 'day', ctx);
    if (!isValidDate(year, month, day)) throw runtimeError(`${describeComponents(year, month, day)} is not a valid date`, ctx.pos);
    return date(daysFromCivil(year, month, day));
  });

  interp.defineMethod('to-date', 'string', 1, (args, ctx) => {
    const text = expectString(arg(args, 0), 'the input of `to-date`', ctx);
    const parsed = parseIsoDate(text);
    if (parsed === null) throw runtimeError(`cannot convert ${formatValue(arg(args, 0), 'show')} to a date`, ctx.pos);
    return fromCivil(parsed);
  });

  interp.defineMethod('year', 'date', 1, (args, ctx) => int(BigInt(civil(expectDate(arg(args, 0), 'the input of `year`', ctx)).year)));

  interp.defineMethod('month', 'date', 1, (args, ctx) => int(BigInt(civil(expectDate(arg(args, 0), 'the input of `month`', ctx)).month)));

  interp.defineMethod('day', 'date', 1, (args, ctx) => int(BigInt(civil(expectDate(arg(args, 0), 'the input of `day`', ctx)).day)));

  interp.defineMethod('weekday', 'date', 1, (args, ctx) => {
    const value = expectDate(arg(args, 0), 'the input of `weekday`', ctx);
    return str(lowerName(WEEKDAY_NAMES, weekday(value.days) - 1));
  });

  interp.defineMethod('weekday-number', 'date', 1, (args, ctx) => {
    const value = expectDate(arg(args, 0), 'the input of `weekday-number`', ctx);
    return int(BigInt(weekday(value.days)));
  });

  interp.defineMethod('month-name', 'date', 1, (args, ctx) => {
    const parts = civil(expectDate(arg(args, 0), 'the input of `month-name`', ctx));
    return str(lowerName(MONTH_NAMES, parts.month - 1));
  });

  interp.defineMethod('day-of-year', 'date', 1, (args, ctx) => {
    const parts = civil(expectDate(arg(args, 0), 'the input of `day-of-year`', ctx));
    return int(BigInt(dayOfYear(parts.year, parts.month, parts.day)));
  });

  interp.defineMethod('is-leap-year', ['date', 'int'], 1, (args, ctx) => {
    const input = arg(args, 0);
    const year = input.t === 'date' ? civil(input).year : expectSmallInt(input, 'the input of `is-leap-year`', 'year', ctx);
    return bool(isLeapYear(year));
  });

  interp.defineMethod('add-days', 'date', 2, (args, ctx) => {
    const value = expectDate(arg(args, 0), 'the input of `add-days`', ctx);
    const count = expectSmallInt(arg(args, 1), 'the count of `add-days`', 'day count', ctx);
    return date(value.days + count);
  });

  interp.defineMethod('add-months', 'date', 2, (args, ctx) => {
    const parts = civil(expectDate(arg(args, 0), 'the input of `add-months`', ctx));
    const count = expectSmallInt(arg(args, 1), 'the count of `add-months`', 'month count', ctx);
    return fromCivil(addMonths(parts.year, parts.month, parts.day, count));
  });

  interp.defineMethod('add-years', 'date', 2, (args, ctx) => {
    const parts = civil(expectDate(arg(args, 0), 'the input of `add-years`', ctx));
    const count = expectSmallInt(arg(args, 1), 'the count of `add-years`', 'year count', ctx);
    return fromCivil(addMonths(parts.year, parts.month, parts.day, count * 12));
  });

  interp.defineMethod('days-between', 'date', 2, (args, ctx) => {
    const start = expectDate(arg(args, 0), 'the input of `days-between`', ctx);
    const end = expectDate(arg(args, 1), 'the end of `days-between`', ctx);
    return int(BigInt(end.days - start.days));
  });

  interp.defineMethod('days-in-month', 'date', 1, (args, ctx) => {
    const parts = civil(expectDate(arg(args, 0), 'the input of `days-in-month`', ctx));
    return int(BigInt(daysInMonth(parts.year, parts.month)));
  });

  interp.defineMethod('start-of-month', 'date', 1, (args, ctx) => {
    const parts = civil(expectDate(arg(args, 0), 'the input of `start-of-month`', ctx));
    return fromCivil({ year: parts.year, month: parts.month, day: 1 });
  });

  interp.defineMethod('end-of-month', 'date', 1, (args, ctx) => {
    const parts = civil(expectDate(arg(args, 0), 'the input of `end-of-month`', ctx));
    return fromCivil({ year: parts.year, month: parts.month, day: daysInMonth(parts.year, parts.month) });
  });

  interp.defineMethod('format', 'date', 2, (args, ctx) => {
    const parts = civil(expectDate(arg(args, 0), 'the input of `format`', ctx));
    const pattern = expectString(arg(args, 1), 'the pattern of `format`', ctx);
    return str(formatDate(parts, pattern));
  });

  interp.defineMethod('to-string', 'date', 1, (args, ctx) => str(formatDateValue(expectDate(arg(args, 0), 'the input of `to-string`', ctx))));
}
