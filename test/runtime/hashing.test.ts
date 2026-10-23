import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FNV_OFFSET,
  FNV_PRIME,
  hashBigInt,
  hashBoolean,
  hashCombine,
  hashNumber,
  hashString,
} from '../../src/runtime/hashing.ts';

function isUint32(n: number): boolean {
  return Number.isInteger(n) && n >= 0 && n <= 0xffffffff;
}

test('FNV constants are the 32-bit FNV-1a offset basis and prime', () => {
  assert.equal(FNV_OFFSET, 2166136261);
  assert.equal(FNV_PRIME, 16777619);
});

test('hashString of the empty string is the FNV offset basis', () => {
  assert.equal(hashString(''), FNV_OFFSET);
});

test('hashString("a") matches FNV-1a over bytes [0x61, 0x00] (low byte of each UTF-16 unit first)', () => {
  assert.equal(hashString('a'), 0x2b24d044);
});

test('hashString is deterministic and distinguishes nearby strings', () => {
  assert.equal(hashString('hello'), hashString('hello'));
  assert.notEqual(hashString('hello'), hashString('hellp'));
  assert.notEqual(hashString('ab'), hashString('ba'));
  assert.notEqual(hashString('Ā'), hashString('\u0001'));
});

test('hashNumber hashes 0 and -0 identically', () => {
  assert.equal(hashNumber(0), hashNumber(-0));
});

test('hashNumber distinguishes 1 from 1.0000001 and is deterministic', () => {
  assert.notEqual(hashNumber(1), hashNumber(1.0000001));
  assert.equal(hashNumber(1.5), hashNumber(1.5));
  assert.equal(hashNumber(-273.15), hashNumber(-273.15));
  assert.notEqual(hashNumber(2), hashNumber(-2));
});

test('hashNumber gives one hash for NaN regardless of how it was produced', () => {
  assert.equal(hashNumber(NaN), hashNumber(0 / 0));
  assert.equal(hashNumber(NaN), hashNumber(Infinity - Infinity));
});

test('hashBigInt: equal bigints hash equal, sign and magnitude both matter', () => {
  assert.equal(hashBigInt(2n ** 70n), hashBigInt(2n ** 70n));
  assert.equal(hashBigInt(0n), hashBigInt(-0n));
  assert.notEqual(hashBigInt(2n ** 70n), hashBigInt(2n ** 70n + 1n));
  assert.notEqual(hashBigInt(5n), hashBigInt(-5n));
});

test('hashBoolean is stable and separates true from false', () => {
  assert.equal(hashBoolean(true), hashBoolean(true));
  assert.equal(hashBoolean(false), hashBoolean(false));
  assert.notEqual(hashBoolean(true), hashBoolean(false));
});

test('hashCombine is order-sensitive and deterministic', () => {
  assert.notEqual(hashCombine(1, 2), hashCombine(2, 1));
  assert.equal(hashCombine(1, 2), hashCombine(1, 2));
  assert.notEqual(hashCombine(hashCombine(0, 1), 2), hashCombine(hashCombine(0, 2), 1));
});

test('every hash is a 32-bit unsigned integer', () => {
  const samples = [
    hashString(''),
    hashString('slopersons'),
    hashString('￿￿￿'),
    hashNumber(0),
    hashNumber(-1e300),
    hashNumber(Number.MAX_SAFE_INTEGER),
    hashNumber(NaN),
    hashBigInt(-(2n ** 200n)),
    hashBoolean(true),
    hashCombine(0xffffffff, 0xffffffff),
    hashCombine(0, 0),
  ];
  for (const sample of samples) {
    assert.ok(isUint32(sample), `expected uint32, got ${sample}`);
  }
});
