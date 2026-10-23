const letterPattern = /^\p{L}$/u;
const digitPattern = /^\p{Nd}$/u;
const spacePattern = /^\s$/u;

export function length(text: string): number {
  let count = 0;
  for (const _cp of text) count += 1;
  return count;
}

export function codePoints(text: string): string[] {
  const out: string[] = [];
  for (const codePoint of text) out.push(codePoint);
  return out;
}

export function charAt(text: string, index: number): string | null {
  if (index < 0) return null;
  let i = 0;
  for (const codePoint of text) {
    if (i === index) return codePoint;
    i += 1;
  }
  return null;
}

export function slice(text: string, start: number, end: number): string {
  const characters = codePoints(text);
  const from = clamp(start, 0, characters.length);
  const to = clamp(end, 0, characters.length);
  return from >= to ? '' : concat(characters, from, to);
}

export function indexOf(text: string, needle: string, from = 0): number {
  const hay = codePoints(text);
  const pattern = codePoints(needle);
  const start = clamp(from, 0, hay.length);
  if (pattern.length === 0) return start;
  for (let i = start; i + pattern.length <= hay.length; i++) {
    if (matchesAt(hay, pattern, i)) return i;
  }
  return -1;
}

export function lastIndexOf(text: string, needle: string): number {
  const hay = codePoints(text);
  const pattern = codePoints(needle);
  for (let i = hay.length - pattern.length; i >= 0; i--) {
    if (matchesAt(hay, pattern, i)) return i;
  }
  return -1;
}

export function contains(text: string, needle: string): boolean {
  return indexOf(text, needle) !== -1;
}

export function startsWith(text: string, prefix: string): boolean {
  return matchesAt(codePoints(text), codePoints(prefix), 0);
}

export function endsWith(text: string, suffix: string): boolean {
  const hay = codePoints(text);
  const pattern = codePoints(suffix);
  return matchesAt(hay, pattern, hay.length - pattern.length);
}

export function replaceAll(text: string, needle: string, replacement: string): string {
  if (needle === '') return text;
  const hay = codePoints(text);
  const pattern = codePoints(needle);
  let out = '';
  let i = 0;
  while (i < hay.length) {
    if (matchesAt(hay, pattern, i)) {
      out += replacement;
      i += pattern.length;
    } else {
      out += hay[i] ?? '';
      i += 1;
    }
  }
  return out;
}

export function split(text: string, separator: string): string[] {
  if (separator === '') return codePoints(text);
  const hay = codePoints(text);
  const delimiter = codePoints(separator);
  const out: string[] = [];
  let current = '';
  let i = 0;
  while (i < hay.length) {
    if (matchesAt(hay, delimiter, i)) {
      out.push(current);
      current = '';
      i += delimiter.length;
    } else {
      current += hay[i] ?? '';
      i += 1;
    }
  }
  out.push(current);
  return out;
}

export function lines(text: string): string[] {
  const parts = split(text, '\n');
  if (parts[parts.length - 1] === '') parts.pop();
  return parts.map(stripTrailingCarriageReturn);
}

export function words(text: string): string[] {
  const out: string[] = [];
  let current = '';
  for (const codePoint of text) {
    if (isSpace(codePoint)) {
      if (current !== '') out.push(current);
      current = '';
    } else {
      current += codePoint;
    }
  }
  if (current !== '') out.push(current);
  return out;
}

export function trim(text: string): string {
  const characters = codePoints(text);
  return concat(characters, leadingSpaces(characters), characters.length - trailingSpaces(characters));
}

export function trimStart(text: string): string {
  const characters = codePoints(text);
  return concat(characters, leadingSpaces(characters), characters.length);
}

export function trimEnd(text: string): string {
  const characters = codePoints(text);
  return concat(characters, 0, characters.length - trailingSpaces(characters));
}

export function padStart(text: string, width: number, pad: string): string {
  const missing = width - length(text);
  return missing <= 0 ? text : repeat(pad, missing) + text;
}

export function padEnd(text: string, width: number, pad: string): string {
  const missing = width - length(text);
  return missing <= 0 ? text : text + repeat(pad, missing);
}

export function repeat(text: string, count: number): string {
  let out = '';
  for (let i = 0; i < count; i++) out += text;
  return out;
}

export function reverse(text: string): string {
  let out = '';
  for (const codePoint of text) out = codePoint + out;
  return out;
}

export function upper(text: string): string {
  let out = '';
  for (const codePoint of text) out += codePoint.toUpperCase();
  return out;
}

export function lower(text: string): string {
  let out = '';
  for (const codePoint of text) out += codePoint.toLowerCase();
  return out;
}

export function isLetter(codePoint: string): boolean {
  return letterPattern.test(codePoint);
}

export function isDigit(codePoint: string): boolean {
  return digitPattern.test(codePoint);
}

export function isSpace(codePoint: string): boolean {
  return spacePattern.test(codePoint);
}

export function parseIntText(text: string): bigint | null {
  const characters = codePoints(text);
  let i = 0;
  let negative = false;
  if (characters[i] === '-' || characters[i] === '+') {
    negative = characters[i] === '-';
    i += 1;
  }
  if (i >= characters.length) return null;
  let value = 0n;
  for (; i < characters.length; i++) {
    const digit = asciiDigitValue(characters[i]);
    if (digit === null) return null;
    value = value * 10n + BigInt(digit);
  }
  return negative ? -value : value;
}

export function parseFloatText(text: string): number | null {
  const characters = codePoints(text);
  let i = 0;
  if (characters[i] === '-' || characters[i] === '+') i += 1;
  const integerEnd = skipAsciiDigits(characters, i);
  if (integerEnd === i) return null;
  i = integerEnd;
  if (characters[i] === '.') {
    const fractionEnd = skipAsciiDigits(characters, i + 1);
    if (fractionEnd === i + 1) return null;
    i = fractionEnd;
  }
  if (characters[i] === 'e' || characters[i] === 'E') {
    i += 1;
    if (characters[i] === '-' || characters[i] === '+') i += 1;
    const exponentEnd = skipAsciiDigits(characters, i);
    if (exponentEnd === i) return null;
    i = exponentEnd;
  }
  if (i !== characters.length) return null;
  return Number(text);
}

export function formatFloat(count: number): string {
  if (!Number.isFinite(count)) return String(count);
  if (Object.is(count, -0)) return '-0.0';
  const base = String(count);
  if (contains(base, '.')) return base;
  const exponentAt = indexOf(base, 'e');
  if (exponentAt === -1) return base + '.0';
  return slice(base, 0, exponentAt) + '.0' + slice(base, exponentAt, length(base));
}

function clamp(value: number, low: number, high: number): number {
  if (value < low) return low;
  if (value > high) return high;
  return value;
}

function concat(characters: readonly string[], start: number, end: number): string {
  let out = '';
  for (let i = start; i < end; i++) out += characters[i] ?? '';
  return out;
}

function matchesAt(hay: readonly string[], pattern: readonly string[], at: number): boolean {
  if (at < 0 || at + pattern.length > hay.length) return false;
  for (let j = 0; j < pattern.length; j++) {
    if (hay[at + j] !== pattern[j]) return false;
  }
  return true;
}

function isSpaceAt(characters: readonly string[], i: number): boolean {
  const codePoint = characters[i];
  return codePoint !== undefined && isSpace(codePoint);
}

function leadingSpaces(characters: readonly string[]): number {
  let i = 0;
  while (i < characters.length && isSpaceAt(characters, i)) i += 1;
  return i;
}

function trailingSpaces(characters: readonly string[]): number {
  let i = 0;
  while (i < characters.length && isSpaceAt(characters, characters.length - 1 - i)) i += 1;
  return i;
}

function stripTrailingCarriageReturn(line: string): string {
  const characters = codePoints(line);
  return characters[characters.length - 1] === '\r' ? concat(characters, 0, characters.length - 1) : line;
}

function asciiDigitValue(codePoint: string | undefined): number | null {
  if (codePoint === undefined) return null;
  const code = codePoint.codePointAt(0);
  if (code === undefined || code < 0x30 || code > 0x39) return null;
  return code - 0x30;
}

function skipAsciiDigits(characters: readonly string[], from: number): number {
  let i = from;
  while (i < characters.length && asciiDigitValue(characters[i]) !== null) i += 1;
  return i;
}
