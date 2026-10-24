export class InvalidUtf8 {
  readonly offset: number;

  constructor(offset: number) {
    this.offset = offset;
  }
}

const REPLACEMENT_CHARACTER = 0xfffd;
const DECODE_CHUNK = 4096;

function scalarAt(text: string, index: number): number {
  const codePoint = text.codePointAt(index) ?? REPLACEMENT_CHARACTER;
  return codePoint >= 0xd800 && codePoint <= 0xdfff ? REPLACEMENT_CHARACTER : codePoint;
}

function unitsOf(text: string, index: number): number {
  return (text.codePointAt(index) ?? 0) > 0xffff ? 2 : 1;
}

function widthOf(codePoint: number): number {
  if (codePoint < 0x80) return 1;
  if (codePoint < 0x800) return 2;
  if (codePoint < 0x10000) return 3;
  return 4;
}

export function utf8Length(text: string): number {
  let size = 0;
  for (let index = 0; index < text.length; index += unitsOf(text, index)) size += widthOf(scalarAt(text, index));
  return size;
}

export function encodeUtf8(text: string): Uint8Array {
  const bytes = new Uint8Array(utf8Length(text));
  let at = 0;
  for (let index = 0; index < text.length; index += unitsOf(text, index)) {
    const codePoint = scalarAt(text, index);
    if (codePoint < 0x80) {
      bytes[at++] = codePoint;
    } else if (codePoint < 0x800) {
      bytes[at++] = 0xc0 | (codePoint >> 6);
      bytes[at++] = 0x80 | (codePoint & 0x3f);
    } else if (codePoint < 0x10000) {
      bytes[at++] = 0xe0 | (codePoint >> 12);
      bytes[at++] = 0x80 | ((codePoint >> 6) & 0x3f);
      bytes[at++] = 0x80 | (codePoint & 0x3f);
    } else {
      bytes[at++] = 0xf0 | (codePoint >> 18);
      bytes[at++] = 0x80 | ((codePoint >> 12) & 0x3f);
      bytes[at++] = 0x80 | ((codePoint >> 6) & 0x3f);
      bytes[at++] = 0x80 | (codePoint & 0x3f);
    }
  }
  return bytes;
}

function sequenceWidth(first: number): number {
  if (first < 0x80) return 1;
  if (first >= 0xc2 && first <= 0xdf) return 2;
  if (first >= 0xe0 && first <= 0xef) return 3;
  if (first >= 0xf0 && first <= 0xf4) return 4;
  return 0;
}

function isScalarOfWidth(codePoint: number, width: number): boolean {
  if (width === 3) return codePoint >= 0x800 && (codePoint < 0xd800 || codePoint > 0xdfff);
  if (width === 4) return codePoint >= 0x10000 && codePoint <= 0x10ffff;
  return true;
}

export function decodeUtf8(bytes: Uint8Array, start: number, end: number): string {
  let text = '';
  const pending: number[] = [];
  let index = start;
  while (index < end) {
    const first = bytes[index] ?? 0;
    const width = sequenceWidth(first);
    if (width === 0 || index + width > end) throw new InvalidUtf8(index - start);
    let codePoint = width === 1 ? first : first & (0x7f >> width);
    for (let k = 1; k < width; k++) {
      const next = bytes[index + k] ?? 0;
      if ((next & 0xc0) !== 0x80) throw new InvalidUtf8(index - start);
      codePoint = (codePoint << 6) | (next & 0x3f);
    }
    if (!isScalarOfWidth(codePoint, width)) throw new InvalidUtf8(index - start);
    pending.push(codePoint);
    if (pending.length === DECODE_CHUNK) {
      text += String.fromCodePoint(...pending);
      pending.length = 0;
    }
    index += width;
  }
  return pending.length === 0 ? text : text + String.fromCodePoint(...pending);
}
