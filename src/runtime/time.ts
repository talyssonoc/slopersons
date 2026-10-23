import { civilFromDays, dateFormatTokens, daysFromCivil, parseIsoDate, readAsciiDigits, renderPattern, type FormatToken } from './calendar.ts';
import { endsWith, padStart } from './text.ts';

export const MS_PER_SECOND = 1000;
export const MS_PER_MINUTE = 60 * MS_PER_SECOND;
export const MS_PER_HOUR = 60 * MS_PER_MINUTE;
export const MS_PER_DAY = 24 * MS_PER_HOUR;

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

export function msFromTimeParts(parts: TimeParts): number {
  return parts.hour * MS_PER_HOUR + parts.minute * MS_PER_MINUTE + parts.second * MS_PER_SECOND + parts.millisecond;
}

export function timePartsFromMs(ms: number): TimeParts {
  const hour = Math.floor(ms / MS_PER_HOUR);
  const minute = Math.floor((ms % MS_PER_HOUR) / MS_PER_MINUTE);
  const second = Math.floor((ms % MS_PER_MINUTE) / MS_PER_SECOND);
  const millisecond = ms % MS_PER_SECOND;
  return { hour, minute, second, millisecond };
}

export function wrapIntoDay(ms: number): number {
  return ((ms % MS_PER_DAY) + MS_PER_DAY) % MS_PER_DAY;
}

export function splitEpochMs(epochMs: number): { days: number; msOfDay: number } {
  const days = Math.floor(epochMs / MS_PER_DAY);
  return { days, msOfDay: epochMs - days * MS_PER_DAY };
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
  return msFromTimeParts({ hour, minute, second, millisecond });
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
  const msOfDay = parseTimeSpan(text, 11, end);
  if (msOfDay === null) return null;
  return daysFromCivil(date.year, date.month, date.day) * MS_PER_DAY + msOfDay;
}

export function timeFormatTokens(ms: number): FormatToken[] {
  const parts = timePartsFromMs(ms);
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

export function formatTime(ms: number, pattern: string): string {
  return renderPattern(pattern, timeFormatTokens(ms));
}

export function formatDateTime(epochMs: number, pattern: string): string {
  const { days, msOfDay } = splitEpochMs(epochMs);
  return renderPattern(pattern, [...dateFormatTokens(civilFromDays(days)), ...timeFormatTokens(msOfDay)]);
}

export function isoTime(ms: number): string {
  return formatTime(ms, ms % MS_PER_SECOND === 0 ? 'HH:MM:SS' : 'HH:MM:SS.SSS');
}

export function isoDateTime(epochMs: number): string {
  const { msOfDay } = splitEpochMs(epochMs);
  return formatDateTime(epochMs, msOfDay % MS_PER_SECOND === 0 ? 'yyyy-mm-ddTHH:MM:SS' : 'yyyy-mm-ddTHH:MM:SS.SSS');
}
