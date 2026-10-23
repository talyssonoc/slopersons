import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stableSort } from '../../src/runtime/sorting.ts';

interface Record {
  key: number;
  id: number;
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let item = state;
    item = Math.imul(item ^ (item >>> 15), item | 1);
    item ^= item + Math.imul(item ^ (item >>> 7), item | 61);
    return ((item ^ (item >>> 14)) >>> 0) / 4294967296;
  };
}

const byNumber = (left: number, right: number): number => left - right;

test('equal keys keep their original relative order', () => {
  const records: Record[] = [
    { key: 2, id: 0 },
    { key: 1, id: 1 },
    { key: 2, id: 2 },
    { key: 1, id: 3 },
    { key: 0, id: 4 },
    { key: 2, id: 5 },
    { key: 1, id: 6 },
  ];
  const sorted = stableSort(records, (left, right) => left.key - right.key);
  assert.deepEqual(
    sorted.map((result) => [result.key, result.id]),
    [
      [0, 4],
      [1, 1],
      [1, 3],
      [1, 6],
      [2, 0],
      [2, 2],
      [2, 5],
    ],
  );
});

test('stability holds for 1 000 records over 10 distinct keys', () => {
  const random = mulberry32(7);
  const records: Record[] = [];
  for (let id = 0; id < 1000; id++) {
    records.push({ key: Math.floor(random() * 10), id });
  }
  const sorted = stableSort(records, (left, right) => left.key - right.key);
  for (let i = 1; i < sorted.length; i++) {
    const previous = sorted[i - 1];
    const curr = sorted[i];
    assert.ok(previous !== undefined && curr !== undefined);
    assert.ok(previous.key <= curr.key, `keys out of order at ${i}`);
    if (previous.key === curr.key) {
      assert.ok(previous.id < curr.id, `equal keys reordered at ${i}`);
    }
  }
});

test('empty input gives an empty array', () => {
  assert.deepEqual(stableSort([], byNumber), []);
});

test('one element is returned as is', () => {
  assert.deepEqual(stableSort([42], byNumber), [42]);
});

test('two elements in either order come out ascending', () => {
  assert.deepEqual(stableSort([1, 2], byNumber), [1, 2]);
  assert.deepEqual(stableSort([2, 1], byNumber), [1, 2]);
});

test('10 000 random numbers match the JS sort oracle', () => {
  const random = mulberry32(12345);
  const items: number[] = [];
  for (let i = 0; i < 10_000; i++) {
    items.push(Math.floor(random() * 2_000_000) - 1_000_000);
  }
  const expected = [...items].sort(byNumber);
  assert.deepEqual(stableSort(items, byNumber), expected);
});

test('odd lengths and already-sorted or reversed inputs match the oracle', () => {
  const ascending = Array.from({ length: 1001 }, (_, i) => i);
  const descending = [...ascending].reverse();
  const allEqual = Array.from({ length: 333 }, () => 5);
  for (const items of [ascending, descending, allEqual]) {
    assert.deepEqual(stableSort(items, byNumber), [...items].sort(byNumber));
  }
});

test('a descending comparator sorts descending', () => {
  assert.deepEqual(stableSort([3, 1, 2], (left, right) => right - left), [3, 2, 1]);
});

test('the input array is not mutated and the result is a different array', () => {
  const items = [3, 1, 2];
  const snapshot = [...items];
  const sorted = stableSort(items, byNumber);
  assert.deepEqual(items, snapshot);
  assert.notEqual(sorted, items);
  assert.deepEqual(stableSort([1], byNumber) === items, false);
});

test('a throwing comparator propagates its error', () => {
  class ComparatorError extends Error {}
  assert.throws(
    () =>
      stableSort([2, 1, 3], () => {
        throw new ComparatorError('boom');
      }),
    ComparatorError,
  );
  assert.doesNotThrow(() =>
    stableSort([1], () => {
      throw new ComparatorError('never called for one element');
    }),
  );
});
