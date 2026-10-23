import { padStart } from './text.ts';

export interface CivilDate {
  year: number;
  month: number;
  day: number;
}

export const WEEKDAY_NAMES: readonly string[] = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

export const MONTH_NAMES: readonly string[] = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const DAYS_PER_ERA = 146097;
const DAYS_FROM_ERA_START_TO_EPOCH = 719468;

export function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

export function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  if (month === 4 || month === 6 || month === 9 || month === 11) return 30;
  return 31;
}

export function isValidDate(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (month < 1 || month > 12) return false;
  return day >= 1 && day <= daysInMonth(year, month);
}

export function daysFromCivil(year: number, month: number, day: number): number {
  const shiftedYear = month <= 2 ? year - 1 : year;
  const era = Math.floor(shiftedYear / 400);
  const yearOfEra = shiftedYear - era * 400;
  const monthFromMarch = month > 2 ? month - 3 : month + 9;
  const dayOfYearFromMarch = Math.floor((153 * monthFromMarch + 2) / 5) + day - 1;
  const dayOfEra = yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYearFromMarch;
  return era * DAYS_PER_ERA + dayOfEra - DAYS_FROM_ERA_START_TO_EPOCH;
}

export function civilFromDays(days: number): CivilDate {
  const daysFromEraStart = days + DAYS_FROM_ERA_START_TO_EPOCH;
  const era = Math.floor(daysFromEraStart / DAYS_PER_ERA);
  const dayOfEra = daysFromEraStart - era * DAYS_PER_ERA;
  const yearOfEra = Math.floor(
    (dayOfEra - Math.floor(dayOfEra / 1460) + Math.floor(dayOfEra / 36524) - Math.floor(dayOfEra / 146096)) / 365,
  );
  const dayOfYearFromMarch = dayOfEra - (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100));
  const monthFromMarch = Math.floor((5 * dayOfYearFromMarch + 2) / 153);
  const day = dayOfYearFromMarch - Math.floor((153 * monthFromMarch + 2) / 5) + 1;
  const month = monthFromMarch < 10 ? monthFromMarch + 3 : monthFromMarch - 9;
  const year = yearOfEra + era * 400 + (month <= 2 ? 1 : 0);
  return { year, month, day };
}

export function weekday(days: number): number {
  return ((((days + 3) % 7) + 7) % 7) + 1;
}

export function dayOfYear(year: number, month: number, day: number): number {
  return daysFromCivil(year, month, day) - daysFromCivil(year, 1, 1) + 1;
}

export function addMonths(year: number, month: number, day: number, count: number): CivilDate {
  const totalMonths = year * 12 + (month - 1) + count;
  const targetYear = Math.floor(totalMonths / 12);
  const targetMonth = totalMonths - targetYear * 12 + 1;
  const targetDay = Math.min(day, daysInMonth(targetYear, targetMonth));
  return { year: targetYear, month: targetMonth, day: targetDay };
}

const CODE_ZERO = 48;
const CODE_NINE = 57;
const CODE_DASH = 45;

export function readAsciiDigits(text: string, start: number, count: number): number | null {
  let value = 0;
  for (let i = start; i < start + count; i++) {
    const code = text.charCodeAt(i);
    if (code < CODE_ZERO || code > CODE_NINE) return null;
    value = value * 10 + (code - CODE_ZERO);
  }
  return value;
}

export function parseIsoDate(text: string): CivilDate | null {
  if (text.length !== 10) return null;
  if (text.charCodeAt(4) !== CODE_DASH || text.charCodeAt(7) !== CODE_DASH) return null;
  const year = readAsciiDigits(text, 0, 4);
  const month = readAsciiDigits(text, 5, 2);
  const day = readAsciiDigits(text, 8, 2);
  if (year === null || month === null || day === null) return null;
  return isValidDate(year, month, day) ? { year, month, day } : null;
}

function zeroPadded(value: number, width: number): string {
  const sign = value < 0 ? '-' : '';
  return sign + padStart(String(Math.abs(value)), width, '0');
}

function nameAt(names: readonly string[], index: number): string {
  const name = names[index];
  if (name === undefined) throw new RangeError(`no calendar name at index ${index}`);
  return name;
}

function monthName(date: CivilDate): string {
  return nameAt(MONTH_NAMES, date.month - 1);
}

function weekdayName(date: CivilDate): string {
  return nameAt(WEEKDAY_NAMES, weekday(daysFromCivil(date.year, date.month, date.day)) - 1);
}

export type FormatToken = readonly [string, string];

export function dateFormatTokens(date: CivilDate): FormatToken[] {
  return [
    ['yyyy', zeroPadded(date.year, 4)],
    ['yy', zeroPadded(((date.year % 100) + 100) % 100, 2)],
    ['mmmm', monthName(date)],
    ['mmm', monthName(date).slice(0, 3)],
    ['mm', zeroPadded(date.month, 2)],
    ['m', String(date.month)],
    ['dddd', weekdayName(date)],
    ['ddd', weekdayName(date).slice(0, 3)],
    ['dd', zeroPadded(date.day, 2)],
    ['d', String(date.day)],
  ];
}

function matchesAt(text: string, token: string, at: number): boolean {
  if (at + token.length > text.length) return false;
  for (let k = 0; k < token.length; k++) {
    if (text.charCodeAt(at + k) !== token.charCodeAt(k)) return false;
  }
  return true;
}

export function renderPattern(pattern: string, tokens: ReadonlyArray<FormatToken>): string {
  let out = '';
  let i = 0;
  while (i < pattern.length) {
    const match = tokens.find(([token]) => matchesAt(pattern, token, i));
    if (match === undefined) {
      out += pattern.charAt(i);
      i += 1;
    } else {
      out += match[1];
      i += match[0].length;
    }
  }
  return out;
}

export function formatDate(date: CivilDate, pattern: string): string {
  return renderPattern(pattern, dateFormatTokens(date));
}
