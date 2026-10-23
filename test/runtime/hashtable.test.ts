import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HashTable } from '../../src/runtime/hashtable.ts';
import type { KeyOperations } from '../../src/runtime/hashtable.ts';
import { hashCombine, hashNumber, hashString } from '../../src/runtime/hashing.ts';

const numberOperations: KeyOperations<number> = {
  hash: hashNumber,
  equals: (left, right) => left === right,
};

const stringOperations: KeyOperations<string> = {
  hash: hashString,
  equals: (left, right) => left === right,
};

interface Point {
  x: number;
  y: number;
}

const pointOperations: KeyOperations<Point> = {
  hash: (point) => hashCombine(hashNumber(point.x), hashNumber(point.y)),
  equals: (left, right) => left.x === right.x && left.y === right.y,
};

const collidingOperations: KeyOperations<number> = {
  hash: () => 7,
  equals: (left, right) => left === right,
};

test('set, get, has and delete on a few numeric keys', () => {
  const table = new HashTable<number, string>(numberOperations);
  table.set(1, 'one');
  table.set(2, 'two');
  table.set(3, 'three');

  assert.equal(table.get(1), 'one');
  assert.equal(table.get(2), 'two');
  assert.equal(table.get(3), 'three');
  assert.equal(table.get(4), undefined);
  assert.equal(table.has(2), true);
  assert.equal(table.has(4), false);

  assert.equal(table.delete(2), true);
  assert.equal(table.delete(2), false);
  assert.equal(table.has(2), false);
  assert.equal(table.get(2), undefined);
  assert.equal(table.get(3), 'three');
});

test('overwriting a key replaces its value and keeps its insertion position', () => {
  const table = new HashTable<string, number>(stringOperations);
  table.set('a', 1);
  table.set('b', 2);
  table.set('c', 3);
  table.set('a', 10);

  assert.equal(table.get('a'), 10);
  assert.equal(table.size, 3);
  assert.deepEqual(table.keys(), ['a', 'b', 'c']);
  assert.deepEqual(table.values(), [10, 2, 3]);
});

test('insertion order survives deletes and later inserts', () => {
  const table = new HashTable<string, number>(stringOperations);
  for (const key of ['a', 'b', 'c', 'd', 'e']) {
    table.set(key, key.charCodeAt(0));
  }
  table.delete('b');
  table.delete('d');
  table.set('f', 102);
  table.set('g', 103);

  assert.deepEqual(table.keys(), ['a', 'c', 'e', 'f', 'g']);
  assert.deepEqual(
    table.entries(),
    [
      ['a', 97],
      ['c', 99],
      ['e', 101],
      ['f', 102],
      ['g', 103],
    ],
  );
});

test('size counts live entries only', () => {
  const table = new HashTable<number, number>(numberOperations);
  assert.equal(table.size, 0);
  table.set(1, 1);
  table.set(2, 2);
  assert.equal(table.size, 2);
  table.set(2, 20);
  assert.equal(table.size, 2);
  table.delete(1);
  assert.equal(table.size, 1);
  table.delete(1);
  assert.equal(table.size, 1);
  table.delete(2);
  assert.equal(table.size, 0);
});

test('delete then reinsert of the same key moves it to the end', () => {
  const table = new HashTable<string, number>(stringOperations);
  table.set('a', 1);
  table.set('b', 2);
  table.set('c', 3);
  table.delete('a');
  table.set('a', 4);

  assert.deepEqual(table.keys(), ['b', 'c', 'a']);
  assert.equal(table.get('a'), 4);
  assert.equal(table.size, 3);
});

test('10 000 integer keys stay retrievable across several growths and keys() keeps insertion order', () => {
  const table = new HashTable<number, number>(numberOperations);
  const count = 10_000;
  for (let i = 0; i < count; i++) {
    table.set(i, i * 2);
  }
  assert.equal(table.size, count);
  for (let i = 0; i < count; i++) {
    assert.equal(table.get(i), i * 2);
  }
  assert.equal(table.has(count), false);

  const keys = table.keys();
  assert.equal(keys.length, count);
  for (let i = 0; i < count; i++) {
    assert.equal(keys[i], i);
  }

  for (let i = 0; i < count; i += 2) {
    assert.equal(table.delete(i), true);
  }
  assert.equal(table.size, count / 2);
  for (let i = 0; i < count; i++) {
    assert.equal(table.has(i), i % 2 === 1);
  }
  const remaining = table.keys();
  for (let i = 0; i < remaining.length; i++) {
    assert.equal(remaining[i], i * 2 + 1);
  }
});

test('a hash function that always returns 7 still yields a correct table for 500 keys', () => {
  const table = new HashTable<number, string>(collidingOperations);
  const count = 500;
  for (let i = 0; i < count; i++) {
    table.set(i, `v${i}`);
  }
  assert.equal(table.size, count);
  for (let i = 0; i < count; i++) {
    assert.equal(table.get(i), `v${i}`);
  }
  assert.equal(table.get(count), undefined);

  for (let i = 0; i < count; i += 2) {
    assert.equal(table.delete(i), true);
  }
  for (let i = 0; i < count; i++) {
    assert.equal(table.has(i), i % 2 === 1);
    if (i % 2 === 1) {
      assert.equal(table.get(i), `v${i}`);
    }
  }
  assert.equal(table.size, count / 2);

  table.set(0, 'again');
  assert.equal(table.get(0), 'again');
  const keys = table.keys();
  assert.equal(keys[keys.length - 1], 0);
});

test('repeated insert and delete of fresh keys does not clog the index with tombstones', () => {
  const table = new HashTable<number, number>(numberOperations);
  for (let i = 0; i < 5000; i++) {
    table.set(i, i);
    assert.equal(table.delete(i), true);
    assert.equal(table.has(i), false);
  }
  assert.equal(table.size, 0);
  assert.deepEqual(table.keys(), []);
  table.set(-1, 42);
  assert.equal(table.get(-1), 42);
  assert.deepEqual(table.entries(), [[-1, 42]]);
});

test('clone() shares nothing with the original', () => {
  const original = new HashTable<string, number>(stringOperations);
  original.set('a', 1);
  original.set('b', 2);

  const copy = original.clone();
  assert.deepEqual(copy.entries(), original.entries());

  copy.set('a', 100);
  copy.set('c', 3);
  copy.delete('b');
  assert.equal(original.get('a'), 1);
  assert.equal(original.has('b'), true);
  assert.equal(original.has('c'), false);
  assert.deepEqual(original.keys(), ['a', 'b']);

  original.set('d', 4);
  original.delete('a');
  assert.equal(copy.get('a'), 100);
  assert.equal(copy.has('d'), false);
  assert.deepEqual(copy.keys(), ['a', 'c']);

  for (let i = 0; i < 1000; i++) {
    copy.set(`k${i}`, i);
  }
  assert.deepEqual(original.keys(), ['b', 'd']);
  assert.equal(copy.size, 1002);
});

test('string keys with a real hash round-trip and distinguish near-identical strings', () => {
  const table = new HashTable<string, number>(stringOperations);
  const words = ['apple', 'banana', 'cherry', 'apple ', 'Apple', 'bananas', ''];
  words.forEach((word, i) => table.set(word, i));
  assert.equal(table.size, words.length);
  words.forEach((word, i) => assert.equal(table.get(word), i));
  assert.equal(table.get('grape'), undefined);
  assert.deepEqual(table.keys(), words);
});

test('object keys are matched structurally through the supplied equals, never by identity', () => {
  const table = new HashTable<Point, string>(pointOperations);
  table.set({ x: 1, y: 2 }, 'first');
  table.set({ x: 3, y: 4 }, 'second');

  assert.equal(table.get({ x: 1, y: 2 }), 'first');
  assert.equal(table.has({ x: 3, y: 4 }), true);
  assert.equal(table.has({ x: 2, y: 1 }), false);

  table.set({ x: 1, y: 2 }, 'replaced');
  assert.equal(table.size, 2);
  assert.equal(table.get({ x: 1, y: 2 }), 'replaced');
  assert.deepEqual(table.keys(), [
    { x: 1, y: 2 },
    { x: 3, y: 4 },
  ]);

  assert.equal(table.delete({ x: 3, y: 4 }), true);
  assert.equal(table.size, 1);
});

test('clear() empties the table and it can be reused afterwards', () => {
  const table = new HashTable<number, number>(numberOperations);
  for (let i = 0; i < 100; i++) {
    table.set(i, i);
  }
  table.clear();
  assert.equal(table.size, 0);
  assert.equal(table.has(5), false);
  assert.deepEqual(table.keys(), []);

  table.set(5, 50);
  assert.equal(table.get(5), 50);
  assert.deepEqual(table.entries(), [[5, 50]]);
});

test('keys(), values() and entries() return fresh arrays, not live views', () => {
  const table = new HashTable<number, number>(numberOperations);
  table.set(1, 10);
  const keys = table.keys();
  const values = table.values();
  const entries = table.entries();
  table.set(2, 20);
  assert.deepEqual(keys, [1]);
  assert.deepEqual(values, [10]);
  assert.deepEqual(entries, [[1, 10]]);
  keys.push(99);
  assert.deepEqual(table.keys(), [1, 2]);
});

test('the table is iterable in insertion order', () => {
  const table = new HashTable<string, number>(stringOperations);
  table.set('x', 1);
  table.set('y', 2);
  table.delete('x');
  table.set('z', 3);
  assert.deepEqual(
    [...table],
    [
      ['y', 2],
      ['z', 3],
    ],
  );
});
