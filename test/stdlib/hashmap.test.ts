import { test } from 'node:test';
import assert from 'node:assert/strict';
import { failure, output } from '../helpers/run.ts';

test('hashmap/at returns the value under a key, comparing keys structurally', () => {
  assert.equal(output('{"a": 1  "b": 2} -> hashmap/at "b" -> io/print-ln'), '2\n');
  assert.equal(output('{[1 2]: "pair"} -> hashmap/at [1 2] -> io/print-ln'), 'pair\n');
  assert.equal(output('{1: "int"  1.0: "float"} -> hashmap/at 1 -> io/print-ln\n{1: "int"  1.0: "float"} -> hashmap/at 1.0 -> io/print-ln'), 'int\nfloat\n');
  assert.equal(output('{"a": {"b": 3}} -> hashmap/at "a" -> hashmap/at "b" -> io/print-ln'), '3\n');
});

test('hashmap/at on a missing key is an error naming the key in show form', () => {
  const missing = failure('{"a": 1} -> hashmap/at "zip"');
  assert.equal(missing.message, 'key "zip" not found in hashmap');
  assert.deepEqual(missing.position, { line: 1, col: 10 });
  assert.equal(failure('{"a": 1} -> hashmap/at 7').message, 'key 7 not found in hashmap');
  assert.equal(failure('{"a": 1} -> hashmap/at [1 2]').message, 'key [1 2] not found in hashmap');
});

test('hashmap/at-or returns the default only when the key is missing', () => {
  assert.equal(output('{"a": 1} => m\nm -> hashmap/at-or "a" 0 -> io/print-ln\nm -> hashmap/at-or "zip" 0 -> io/print-ln\n{"a": nothing} -> hashmap/at-or "a" 0 -> io/print-ln'), '1\n0\nnothing\n');
});

test('hashmap/put adds or overwrites in place, keeps insertion order and returns the same hashmap', () => {
  assert.equal(output('{"a": 1  "b": 2} => m\nm -> hashmap/put "a" 10 -> hashmap/put "c" 3\nm -> io/print-ln'), '{"a": 10  "b": 2  "c": 3}\n');
  assert.equal(output('{} => m\nm -> hashmap/put "x" 1 -> hashmap/put "y" 2 -> hashmap/length -> io/print-ln\nm -> io/print-ln'), '2\n{"x": 1  "y": 2}\n');
});

test('hashmap/remove deletes in place, ignores absent keys and a re-added key goes last', () => {
  assert.equal(output('{"a": 1  "b": 2  "c": 3} => m\nm -> hashmap/remove "b" -> hashmap/remove "zip" -> io/print-ln\nm -> hashmap/put "b" 4 -> io/print-ln'), '{"a": 1  "c": 3}\n{"a": 1  "c": 3  "b": 4}\n');
});

test('hashmap/has checks membership structurally', () => {
  assert.equal(output('{"a": 1  [1 2]: 3} => m\nm -> hashmap/has "a" -> io/print-ln\nm -> hashmap/has [1 2] -> io/print-ln\nm -> hashmap/has "zip" -> io/print-ln\nm -> hashmap/has 1 -> io/print-ln'), 'yes\nyes\nno\nno\n');
});

test('hashmap/keys, hashmap/values and hashmap/entries follow insertion order', () => {
  assert.equal(output('{"b": 2  "a": 1} => m\nm -> hashmap/keys -> io/print-ln\nm -> hashmap/values -> io/print-ln\nm -> hashmap/entries -> io/print-ln'), '["b" "a"]\n[2 1]\n[["b" 2] ["a" 1]]\n');
  assert.equal(output('{} -> hashmap/keys -> io/print-ln\n{} -> hashmap/values -> io/print-ln\n{} -> hashmap/entries -> io/print-ln'), '[]\n[]\n[]\n');
});

test('hashmap/length and hashmap/is-empty', () => {
  assert.equal(output('{} -> hashmap/length -> io/print-ln\n{} -> hashmap/is-empty -> io/print-ln\n{"a": 1  "b": 2} -> hashmap/length -> io/print-ln\n{"a": 1} -> hashmap/is-empty -> io/print-ln'), '0\nyes\n2\nno\n');
});

test('hashmap/merge builds a new hashmap where the other side wins and leaves both inputs untouched', () => {
  const source = '{"a": 1  "b": 2} => left\n{"b": 20  "c": 3} => right\nleft -> hashmap/merge right -> io/print-ln\nleft -> io/print-ln\nright -> io/print-ln';
  assert.equal(output(source), '{"a": 1  "b": 20  "c": 3}\n{"a": 1  "b": 2}\n{"b": 20  "c": 3}\n');
  assert.equal(failure('{"a": 1} -> hashmap/merge [1]').message, 'the argument of `hashmap/merge` must be a hashmap, got an array');
});

test('hashmap/each visits key and value in insertion order, honors stop and out, and returns nothing', () => {
  assert.equal(output('{"a": 1  "b": 2  "c": 3} -> hashmap/each k v\n| "{k}={v}" -> io/print-ln'), 'a=1\nb=2\nc=3\n');
  assert.equal(output('{"a": 1  "b": 2  "c": 3} -> hashmap/each k v\n| k = "b" ? stop\n| v -> io/print-ln'), '1\n');
  assert.equal(output('({"a": 1} -> hashmap/each k v | v) -> io/print-ln'), 'nothing\n');
  assert.equal(output('proc find-key m target\n| m -> hashmap/each k v\n| | v = target ? k -> out\n| nothing\n{"a": 1  "b": 2} -> find-key 2 -> io/print-ln'), 'b\n');
  assert.equal(failure('{"a": 1} -> hashmap/each k | k').message, '`lambda` expects 1 argument, got 2');
});

test('hashmap/each walks a snapshot, so putting during iteration does not extend the loop', () => {
  assert.equal(output('{"a": 1  "b": 2} => m\nm -> hashmap/each k v\n| m -> hashmap/put "{k}{k}" v\nm -> io/print-ln'), '{"a": 1  "b": 2  "aa": 1  "bb": 2}\n');
});

test('hashmap/map-values builds a new hashmap with the same keys', () => {
  assert.equal(output('{"a": 1  "b": 2} => m\n(m -> hashmap/map-values v | v * 10) -> io/print-ln\nm -> io/print-ln'), '{"a": 10  "b": 20}\n{"a": 1  "b": 2}\n');
});

test('hashmap/keep filters entries into a new hashmap and demands a boolean', () => {
  const source = '{"a": 1  "b": 2  "c": 3} => m\n(m -> hashmap/keep k v | v > 1) -> io/print-ln\n(m -> hashmap/keep k v | k = "a") -> io/print-ln\nm -> io/print-ln';
  assert.equal(output(source), '{"b": 2  "c": 3}\n{"a": 1}\n{"a": 1  "b": 2  "c": 3}\n');
  assert.equal(failure('{"a": 1} -> hashmap/keep k v | v').message, 'the condition in `hashmap/keep` must return `yes` or `no`, got an int');
});

test('hashmap/copy is independent from the original', () => {
  assert.equal(output('{"a": 1} => m\nm -> hashmap/copy => c\nc -> hashmap/put "b" 2\nm -> hashmap/put "a" 0\nm -> io/print-ln\nc -> io/print-ln'), '{"a": 0}\n{"a": 1  "b": 2}\n');
});

test('hashmaps print as literals with two spaces between entries', () => {
  assert.equal(output('{"a": 1  "b": 2} -> io/print-ln\n{} -> io/print-ln\n{"a": 1} -> show -> io/print-ln\n{"k": [1 {"n": `c`}]} -> io/print-ln'), '{"a": 1  "b": 2}\n{}\n{"a": 1}\n{"k": [1 {"n": `c`}]}\n');
});

test('hashmap functions reject an input that is not a hashmap, naming the qualified function', () => {
  assert.equal(failure('1 -> hashmap/keys').message, 'the input of `hashmap/keys` must be a hashmap, got an int');
  assert.equal(failure('yes -> hashmap/put "a" 1').message, 'the input of `hashmap/put` must be a hashmap, got a boolean');
  assert.equal(failure('nothing -> hashmap/at "a"').message, 'the input of `hashmap/at` must be a hashmap, got a nothing');
  assert.equal(failure('[1] -> hashmap/map-values v | v').message, 'the input of `hashmap/map-values` must be a hashmap, got an array');
});

test('hashmap functions check their arity under the qualified name', () => {
  assert.equal(failure('{} -> hashmap/put "a"').message, '`hashmap/put` expects 3 arguments, got 2');
  assert.equal(failure('{} -> hashmap/keys 1').message, '`hashmap/keys` expects 1 argument, got 2');
});

test('the bare names and hashmap/to-array are gone', () => {
  assert.equal(failure('{} -> keys').message, 'unknown name `keys`');
  assert.equal(failure('{} -> hashmap/to-array').message, 'module `hashmap` has no exported name `to-array`');
});
