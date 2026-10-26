import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomFillSync } from 'node:crypto';
import { NO_RANDOMNESS, randomBelow, randomBetween, randomFloat, randomHex, shuffled } from '../../src/runtime/random.ts';
import { scriptedRandomness } from '../helpers/fake-randomness.ts';

test('randomBelow masks the first byte to the bits the range needs', () => {
  assert.equal(randomBelow(scriptedRandomness([0xfd]), 6n), 5n);
});

test('randomBelow draws again instead of folding a value past the range into it', () => {
  const randomness = scriptedRandomness([0x06, 0x07, 0x03]);
  assert.equal(randomBelow(randomness, 6n), 3n);
  assert.equal(randomness.used, 3);
});

test('randomBelow takes as many bytes as the largest value needs', () => {
  assert.equal(randomBelow(scriptedRandomness([0xff]), 256n), 255n);
  assert.equal(randomBelow(scriptedRandomness([0xff, 0x00]), 257n), 256n);
  const randomness = scriptedRandomness([0xff, 0x2a, 0xfe, 0x2a]);
  assert.equal(randomBelow(randomness, 257n), 42n);
  assert.equal(randomness.used, 4);
});

test('randomBelow reaches ranges larger than a float can count', () => {
  const bound = 2n ** 80n;
  assert.equal(randomBelow(scriptedRandomness(new Array(10).fill(0xff)), bound), bound - 1n);
});

test('randomBelow of 1 is 0 and uses no bytes', () => {
  const randomness = scriptedRandomness([]);
  assert.equal(randomBelow(randomness, 1n), 0n);
  assert.equal(randomness.used, 0);
});

test('randomBetween includes both ends and works below zero', () => {
  assert.equal(randomBetween(scriptedRandomness([0x00]), -3n, 3n), -3n);
  assert.equal(randomBetween(scriptedRandomness([0x06]), -3n, 3n), 3n);
});

test('randomFloat spans [0, 1) in steps of 2^-53', () => {
  assert.equal(randomFloat(scriptedRandomness(new Array(7).fill(0x00))), 0);
  assert.equal(randomFloat(scriptedRandomness(new Array(7).fill(0xff))), 1 - 2 ** -53);
  assert.equal(randomFloat(scriptedRandomness([0x80, 0, 0, 0, 0, 0, 0])), 0.5);
  assert.equal(randomFloat(scriptedRandomness([0, 0, 0, 0, 0, 0, 0x08])), 2 ** -53);
});

test('shuffled swaps from the end, Fisher-Yates style, and leaves its input alone', () => {
  const items = ['a', 'b', 'c', 'd'];
  assert.deepEqual(shuffled(scriptedRandomness([0x00, 0x00, 0x00]), items), ['b', 'c', 'd', 'a']);
  assert.deepEqual(shuffled(scriptedRandomness([0x03, 0x02, 0x01]), items), ['a', 'b', 'c', 'd']);
  assert.deepEqual(items, ['a', 'b', 'c', 'd']);
});

// 10000 each, give or take 91: swapping with any position instead of only earlier ones is
// off by about 1100 for some orders, while these bounds fail a correct shuffle about once in
// ten million runs.
test('shuffled gives every order of three items equally often', () => {
  const randomness = { fill: (bytes: Uint8Array) => void randomFillSync(bytes) };
  const counts = new Map<string, number>();
  for (let i = 0; i < 60_000; i++) {
    const order = shuffled(randomness, ['a', 'b', 'c']).join('');
    counts.set(order, (counts.get(order) ?? 0) + 1);
  }
  assert.equal(counts.size, 6);
  for (const count of counts.values()) assert.ok(count > 9500 && count < 10_500, `an order came up ${count} times out of 60000`);
});

test('randomHex writes two lowercase digits per byte and cuts an odd length short', () => {
  assert.equal(randomHex(scriptedRandomness([0xab, 0x01, 0xf0]), 6), 'ab01f0');
  assert.equal(randomHex(scriptedRandomness([0xab, 0x01]), 3), 'ab0');
  assert.equal(randomHex(scriptedRandomness([]), 0), '');
});

test('without a source, drawing is an interpreter bug rather than a quiet fixed value', () => {
  assert.throws(() => randomBelow(NO_RANDOMNESS, 6n), /without a source of random bytes/);
});
