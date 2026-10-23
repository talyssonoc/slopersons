import { test } from 'node:test';
import assert from 'node:assert/strict';
import { InvalidUtf8, decodeUtf8, encodeUtf8 } from '../../src/runtime/utf8.ts';

const platformEncoder = new TextEncoder();
const strictPlatformDecoder = new TextDecoder('utf-8', { fatal: true });

function decodeAll(bytes: number[]): string {
  return decodeUtf8(Uint8Array.from(bytes), 0, bytes.length);
}

function invalidOffset(bytes: number[]): number | null {
  try {
    decodeAll(bytes);
    return null;
  } catch (error) {
    if (error instanceof InvalidUtf8) return error.offset;
    throw error;
  }
}

const samples = ['', 'plain ascii', 'café ü', '日本語', '🎉 party', '\u007f\u0080߿ࠀ￿\u{10000}\u{10ffff}', 'a\r\nb\n'];

test('encodeUtf8 produces the same bytes as the platform encoder for one- to four-byte characters', () => {
  for (const sample of samples) assert.deepEqual(encodeUtf8(sample), platformEncoder.encode(sample), sample);
});

test('decodeUtf8 reverses encodeUtf8 across the whole code point range', () => {
  let text = '';
  for (let codePoint = 0; codePoint <= 0x10ffff; codePoint += 97) {
    if (codePoint < 0xd800 || codePoint > 0xdfff) text += String.fromCodePoint(codePoint);
  }
  for (const sample of [...samples, text]) assert.equal(decodeUtf8(encodeUtf8(sample), 0, encodeUtf8(sample).length), sample);
});

test('decodeUtf8 decodes only the requested range', () => {
  const bytes = encodeUtf8('ab€cd');
  assert.equal(decodeUtf8(bytes, 2, 5), '€');
  assert.equal(decodeUtf8(bytes, 5, 7), 'cd');
});

test('decodeUtf8 rejects malformed input at the offset where the bad sequence starts', () => {
  const cases: [string, number[], number][] = [
    ['a byte that never starts a sequence', [0x61, 0xff], 1],
    ['a continuation byte with no lead', [0x80], 0],
    ['an overlong two-byte form', [0xc0, 0xaf], 0],
    ['an overlong three-byte form', [0xe0, 0x80, 0xaf], 0],
    ['an overlong four-byte form', [0xf0, 0x80, 0x80, 0xaf], 0],
    ['an encoded surrogate', [0xed, 0xa0, 0x80], 0],
    ['a code point above U+10FFFF', [0xf4, 0x90, 0x80, 0x80], 0],
    ['a lead byte above F4', [0xf5, 0x80, 0x80, 0x80], 0],
    ['a sequence cut off by the end', [0x61, 0x62, 0xe6, 0x97], 2],
    ['a lead byte followed by a non-continuation', [0xc3, 0x28], 0],
  ];
  for (const [name, bytes, offset] of cases) {
    assert.throws(() => strictPlatformDecoder.decode(Uint8Array.from(bytes)), TypeError, `the platform decoder accepts ${name}`);
    assert.equal(invalidOffset(bytes), offset, name);
  }
});

test('decodeUtf8 agrees with the strict platform decoder on random bytes', () => {
  let seed = 12345;
  const next = (): number => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed;
  };
  for (let round = 0; round < 3000; round++) {
    const bytes = Array.from({ length: next() % 12 }, () => (next() % 4 === 0 ? 0x80 + (next() % 0x80) : next() % 0x100));
    let expected: string | null;
    try {
      expected = strictPlatformDecoder.decode(Uint8Array.from(bytes));
    } catch {
      expected = null;
    }
    const actual = invalidOffset(bytes) === null ? decodeAll(bytes) : null;
    assert.equal(actual, expected, `bytes ${bytes.map((byte) => byte.toString(16)).join(' ')}`);
  }
});

test('encodeUtf8 writes a lone surrogate as the replacement character', () => {
  assert.deepEqual(encodeUtf8('a\ud800b'), Uint8Array.from([0x61, 0xef, 0xbf, 0xbd, 0x62]));
});
