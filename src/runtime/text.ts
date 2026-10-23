const letterPattern = /^\p{L}$/u;
const digitPattern = /^\p{Nd}$/u;
const spacePattern = /^\s$/u;

export function length(s: string): number {
  let count = 0;
  for (const _cp of s) count += 1;
  return count;
}

export function codePoints(s: string): string[] {
  const out: string[] = [];
  for (const cp of s) out.push(cp);
  return out;
}

export function charAt(s: string, index: number): string | null {
  if (index < 0) return null;
  let i = 0;
  for (const cp of s) {
    if (i === index) return cp;
    i += 1;
  }
  return null;
}

export function slice(s: string, start: number, end: number): string {
  const cps = codePoints(s);
  const from = clamp(start, 0, cps.length);
  const to = clamp(end, 0, cps.length);
  return from >= to ? '' : concat(cps, from, to);
}

export function indexOf(s: string, needle: string, from = 0): number {
  const hay = codePoints(s);
  const pat = codePoints(needle);
  const start = clamp(from, 0, hay.length);
  if (pat.length === 0) return start;
  for (let i = start; i + pat.length <= hay.length; i++) {
    if (matchesAt(hay, pat, i)) return i;
  }
  return -1;
}

export function lastIndexOf(s: string, needle: string): number {
  const hay = codePoints(s);
  const pat = codePoints(needle);
  for (let i = hay.length - pat.length; i >= 0; i--) {
    if (matchesAt(hay, pat, i)) return i;
  }
  return -1;
}

export function contains(s: string, needle: string): boolean {
  return indexOf(s, needle) !== -1;
}

export function startsWith(s: string, prefix: string): boolean {
  return matchesAt(codePoints(s), codePoints(prefix), 0);
}

export function endsWith(s: string, suffix: string): boolean {
  const hay = codePoints(s);
  const pat = codePoints(suffix);
  return matchesAt(hay, pat, hay.length - pat.length);
}

export function replaceAll(s: string, needle: string, replacement: string): string {
  if (needle === '') return s;
  const hay = codePoints(s);
  const pat = codePoints(needle);
  let out = '';
  let i = 0;
  while (i < hay.length) {
    if (matchesAt(hay, pat, i)) {
      out += replacement;
      i += pat.length;
    } else {
      out += hay[i] ?? '';
      i += 1;
    }
  }
  return out;
}

export function split(s: string, separator: string): string[] {
  if (separator === '') return codePoints(s);
  const hay = codePoints(s);
  const sep = codePoints(separator);
  const out: string[] = [];
  let current = '';
  let i = 0;
  while (i < hay.length) {
    if (matchesAt(hay, sep, i)) {
      out.push(current);
      current = '';
      i += sep.length;
    } else {
      current += hay[i] ?? '';
      i += 1;
    }
  }
  out.push(current);
  return out;
}

export function lines(s: string): string[] {
  const parts = split(s, '\n');
  if (parts[parts.length - 1] === '') parts.pop();
  return parts.map(stripTrailingCarriageReturn);
}

export function words(s: string): string[] {
  const out: string[] = [];
  let current = '';
  for (const cp of s) {
    if (isSpace(cp)) {
      if (current !== '') out.push(current);
      current = '';
    } else {
      current += cp;
    }
  }
  if (current !== '') out.push(current);
  return out;
}

export function trim(s: string): string {
  const cps = codePoints(s);
  return concat(cps, leadingSpaces(cps), cps.length - trailingSpaces(cps));
}

export function trimStart(s: string): string {
  const cps = codePoints(s);
  return concat(cps, leadingSpaces(cps), cps.length);
}

export function trimEnd(s: string): string {
  const cps = codePoints(s);
  return concat(cps, 0, cps.length - trailingSpaces(cps));
}

export function padStart(s: string, width: number, pad: string): string {
  const missing = width - length(s);
  return missing <= 0 ? s : repeat(pad, missing) + s;
}

export function padEnd(s: string, width: number, pad: string): string {
  const missing = width - length(s);
  return missing <= 0 ? s : s + repeat(pad, missing);
}

export function repeat(s: string, count: number): string {
  let out = '';
  for (let i = 0; i < count; i++) out += s;
  return out;
}

export function reverse(s: string): string {
  let out = '';
  for (const cp of s) out = cp + out;
  return out;
}

export function upper(s: string): string {
  let out = '';
  for (const cp of s) out += cp.toUpperCase();
  return out;
}

export function lower(s: string): string {
  let out = '';
  for (const cp of s) out += cp.toLowerCase();
  return out;
}

export function isLetter(cp: string): boolean {
  return letterPattern.test(cp);
}

export function isDigit(cp: string): boolean {
  return digitPattern.test(cp);
}

export function isSpace(cp: string): boolean {
  return spacePattern.test(cp);
}

export function parseIntText(s: string): bigint | null {
  const cps = codePoints(s);
  let i = 0;
  let negative = false;
  if (cps[i] === '-' || cps[i] === '+') {
    negative = cps[i] === '-';
    i += 1;
  }
  if (i >= cps.length) return null;
  let value = 0n;
  for (; i < cps.length; i++) {
    const digit = asciiDigitValue(cps[i]);
    if (digit === null) return null;
    value = value * 10n + BigInt(digit);
  }
  return negative ? -value : value;
}

export function parseFloatText(s: string): number | null {
  const cps = codePoints(s);
  let i = 0;
  if (cps[i] === '-' || cps[i] === '+') i += 1;
  const integerEnd = skipAsciiDigits(cps, i);
  if (integerEnd === i) return null;
  i = integerEnd;
  if (cps[i] === '.') {
    const fractionEnd = skipAsciiDigits(cps, i + 1);
    if (fractionEnd === i + 1) return null;
    i = fractionEnd;
  }
  if (cps[i] === 'e' || cps[i] === 'E') {
    i += 1;
    if (cps[i] === '-' || cps[i] === '+') i += 1;
    const exponentEnd = skipAsciiDigits(cps, i);
    if (exponentEnd === i) return null;
    i = exponentEnd;
  }
  if (i !== cps.length) return null;
  return Number(s);
}

export function formatFloat(n: number): string {
  if (!Number.isFinite(n)) return String(n);
  if (Object.is(n, -0)) return '-0.0';
  const base = String(n);
  if (contains(base, '.')) return base;
  const exponentAt = indexOf(base, 'e');
  if (exponentAt === -1) return base + '.0';
  return slice(base, 0, exponentAt) + '.0' + slice(base, exponentAt, length(base));
}

function clamp(n: number, low: number, high: number): number {
  if (n < low) return low;
  if (n > high) return high;
  return n;
}

function concat(cps: readonly string[], start: number, end: number): string {
  let out = '';
  for (let i = start; i < end; i++) out += cps[i] ?? '';
  return out;
}

function matchesAt(hay: readonly string[], pat: readonly string[], at: number): boolean {
  if (at < 0 || at + pat.length > hay.length) return false;
  for (let j = 0; j < pat.length; j++) {
    if (hay[at + j] !== pat[j]) return false;
  }
  return true;
}

function isSpaceAt(cps: readonly string[], i: number): boolean {
  const cp = cps[i];
  return cp !== undefined && isSpace(cp);
}

function leadingSpaces(cps: readonly string[]): number {
  let i = 0;
  while (i < cps.length && isSpaceAt(cps, i)) i += 1;
  return i;
}

function trailingSpaces(cps: readonly string[]): number {
  let i = 0;
  while (i < cps.length && isSpaceAt(cps, cps.length - 1 - i)) i += 1;
  return i;
}

function stripTrailingCarriageReturn(line: string): string {
  const cps = codePoints(line);
  return cps[cps.length - 1] === '\r' ? concat(cps, 0, cps.length - 1) : line;
}

function asciiDigitValue(cp: string | undefined): number | null {
  if (cp === undefined) return null;
  const code = cp.codePointAt(0);
  if (code === undefined || code < 0x30 || code > 0x39) return null;
  return code - 0x30;
}

function skipAsciiDigits(cps: readonly string[], from: number): number {
  let i = from;
  while (i < cps.length && asciiDigitValue(cps[i]) !== null) i += 1;
  return i;
}
