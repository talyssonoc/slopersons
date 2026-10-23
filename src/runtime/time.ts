import { civilFromDays, dateFormatTokens, daysFromCivil, parseIsoDate, readAsciiDigits, renderPattern, type FormatToken } from './calendar.ts';
import { endsWith, padStart } from './text.ts';

export const MILLISECONDS_PER_SECOND = 1000;
export const MILLISECONDS_PER_MINUTE = 60 * MILLISECONDS_PER_SECOND;
export const MILLISECONDS_PER_HOUR = 60 * MILLISECONDS_PER_MINUTE;
export const MILLISECONDS_PER_DAY = 24 * MILLISECONDS_PER_HOUR;

export interface TimeParts {
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
}

export function isValidTime(hour: number, minute: number, second: number, millisecond: number): boolean {
  return (
    Number.isInteger(hour) && hour >= 0 && hour < 24 &&
    Number.isInteger(minute) && minute >= 0 && minute < 60 &&
    Number.isInteger(second) && second >= 0 && second < 60 &&
    Number.isInteger(millisecond) && millisecond >= 0 && millisecond < 1000
  );
}

export function millisecondsFromTimeParts(parts: TimeParts): number {
  return parts.hour * MILLISECONDS_PER_HOUR + parts.minute * MILLISECONDS_PER_MINUTE + parts.second * MILLISECONDS_PER_SECOND + parts.millisecond;
}

export function timePartsFromMs(milliseconds: number): TimeParts {
  const hour = Math.floor(milliseconds / MILLISECONDS_PER_HOUR);
  const minute = Math.floor((milliseconds % MILLISECONDS_PER_HOUR) / MILLISECONDS_PER_MINUTE);
  const second = Math.floor((milliseconds % MILLISECONDS_PER_MINUTE) / MILLISECONDS_PER_SECOND);
  const millisecond = milliseconds % MILLISECONDS_PER_SECOND;
  return { hour, minute, second, millisecond };
}

export function wrapIntoDay(milliseconds: number): number {
  return ((milliseconds % MILLISECONDS_PER_DAY) + MILLISECONDS_PER_DAY) % MILLISECONDS_PER_DAY;
}

export function splitEpochMs(epochMs: number): { days: number; millisecondsOfDay: number } {
  const days = Math.floor(epochMs / MILLISECONDS_PER_DAY);
  return { days, millisecondsOfDay: epochMs - days * MILLISECONDS_PER_DAY };
}

const CODE_ZERO = 48;
const CODE_NINE = 57;
const CODE_COLON = 58;
const CODE_DOT = 46;

function isDigitCode(code: number): boolean {
  return code >= CODE_ZERO && code <= CODE_NINE;
}

function parseTimeSpan(text: string, start: number, end: number): number | null {
  const length = end - start;
  if (length !== 5 && length !== 8 && !(length >= 10 && length <= 12)) return null;
  const hour = readAsciiDigits(text, start, 2);
  if (text.charCodeAt(start + 2) !== CODE_COLON) return null;
  const minute = readAsciiDigits(text, start + 3, 2);
  if (hour === null || minute === null) return null;
  let second = 0;
  let millisecond = 0;
  if (length >= 8) {
    if (text.charCodeAt(start + 5) !== CODE_COLON) return null;
    const parsedSecond = readAsciiDigits(text, start + 6, 2);
    if (parsedSecond === null) return null;
    second = parsedSecond;
  }
  if (length >= 10) {
    if (text.charCodeAt(start + 8) !== CODE_DOT) return null;
    let fraction = 0;
    let digits = 0;
    for (let i = start + 9; i < end; i++) {
      const code = text.charCodeAt(i);
      if (!isDigitCode(code)) return null;
      fraction = fraction * 10 + (code - CODE_ZERO);
      digits++;
    }
    while (digits < 3) {
      fraction *= 10;
      digits++;
    }
    millisecond = fraction;
  }
  if (!isValidTime(hour, minute, second, millisecond)) return null;
  return millisecondsFromTimeParts({ hour, minute, second, millisecond });
}

export function parseIsoTime(text: string): number | null {
  return parseTimeSpan(text, 0, text.length);
}

export function parseIsoDateTime(text: string): number | null {
  if (text.length < 16) return null;
  const date = parseIsoDate(text.slice(0, 10));
  if (date === null) return null;
  const separator = text.charAt(10);
  if (separator !== 'T' && separator !== ' ') return null;
  const end = endsWith(text, 'Z') ? text.length - 1 : text.length;
  const millisecondsOfDay = parseTimeSpan(text, 11, end);
  if (millisecondsOfDay === null) return null;
  return daysFromCivil(date.year, date.month, date.day) * MILLISECONDS_PER_DAY + millisecondsOfDay;
}

export function timeFormatTokens(milliseconds: number): FormatToken[] {
  const parts = timePartsFromMs(milliseconds);
  return [
    ['SSS', padStart(String(parts.millisecond), 3, '0')],
    ['HH', padStart(String(parts.hour), 2, '0')],
    ['H', String(parts.hour)],
    ['MM', padStart(String(parts.minute), 2, '0')],
    ['M', String(parts.minute)],
    ['SS', padStart(String(parts.second), 2, '0')],
    ['S', String(parts.second)],
  ];
}

export function formatTime(milliseconds: number, pattern: string): string {
  return renderPattern(pattern, timeFormatTokens(milliseconds));
}

export function formatDateTime(epochMs: number, pattern: string): string {
  const { days, millisecondsOfDay: dayMilliseconds } = splitEpochMs(epochMs);
  return renderPattern(pattern, [...dateFormatTokens(civilFromDays(days)), ...timeFormatTokens(dayMilliseconds)]);
}

export function isoTime(milliseconds: number): string {
  return formatTime(milliseconds, milliseconds % MILLISECONDS_PER_SECOND === 0 ? 'HH:MM:SS' : 'HH:MM:SS.SSS');
}

export function isoDateTime(epochMs: number): string {
  const { millisecondsOfDay: dayMilliseconds } = splitEpochMs(epochMs);
  return formatDateTime(epochMs, dayMilliseconds % MILLISECONDS_PER_SECOND === 0 ? 'yyyy-mm-ddTHH:MM:SS' : 'yyyy-mm-ddTHH:MM:SS.SSS');
}
