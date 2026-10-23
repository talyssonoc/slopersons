import { test } from 'node:test';
import assert from 'node:assert/strict';
import { failure, output } from '../helpers/run.ts';

test('at returns the value under a key, comparing keys structurally', () => {
  assert.equal(output('{"a": 1  "b": 2} -> at "b" -> print'), '2\n');
  assert.equal(output('{[1 2]: "pair"} -> at [1 2] -> print'), 'pair\n');
  assert.equal(output('{1: "int"  1.0: "float"} -> at 1 -> print\n{1: "int"  1.0: "float"} -> at 1.0 -> print'), 'int\nfloat\n');
  assert.equal(output('{"a": {"b": 3}} -> at "a" -> at "b" -> print'), '3\n');
});

test('at on a missing key is an error naming the key in show form', () => {
  const missing = failure('{"a": 1} -> at "zip"');
  assert.equal(missing.message, 'key "zip" not found in hashmap');
  assert.deepEqual(missing.pos, { line: 1, col: 10 });
  assert.equal(failure('{"a": 1} -> at 7').message, 'key 7 not found in hashmap');
  assert.equal(failure('{"a": 1} -> at [1 2]').message, 'key [1 2] not found in hashmap');
});

test('at-or returns the default only when the key is missing', () => {
  assert.equal(output('{"a": 1} => m\nm -> at-or "a" 0 -> print\nm -> at-or "zip" 0 -> print\n{"a": nothing} -> at-or "a" 0 -> print'), '1\n0\nnothing\n');
});

test('put adds or overwrites in place, keeps insertion order and returns the same hashmap', () => {
  assert.equal(output('{"a": 1  "b": 2} => m\nm -> put "a" 10 -> put "c" 3\nm -> print'), '{"a": 10  "b": 2  "c": 3}\n');
  assert.equal(output('{} => m\nm -> put "x" 1 -> put "y" 2 -> length -> print\nm -> print'), '2\n{"x": 1  "y": 2}\n');
});

test('remove deletes in place, ignores absent keys and a re-added key goes last', () => {
  assert.equal(output('{"a": 1  "b": 2  "c": 3} => m\nm -> remove "b" -> remove "zip" -> print\nm -> put "b" 4 -> print'), '{"a": 1  "c": 3}\n{"a": 1  "c": 3  "b": 4}\n');
});

test('has checks membership structurally', () => {
  assert.equal(output('{"a": 1  [1 2]: 3} => m\nm -> has "a" -> print\nm -> has [1 2] -> print\nm -> has "zip" -> print\nm -> has 1 -> print'), 'yes\nyes\nno\nno\n');
});

test('keys, values, entries and to-array follow insertion order', () => {
  assert.equal(output('{"b": 2  "a": 1} => m\nm -> keys -> print\nm -> values -> print\nm -> entries -> print\nm -> to-array -> print'), '["b" "a"]\n[2 1]\n[["b" 2] ["a" 1]]\n[["b" 2] ["a" 1]]\n');
  assert.equal(output('{} -> keys -> print\n{} -> values -> print\n{} -> entries -> print'), '[]\n[]\n[]\n');
});

test('length and is-empty', () => {
  assert.equal(output('{} -> length -> print\n{} -> is-empty -> print\n{"a": 1  "b": 2} -> length -> print\n{"a": 1} -> is-empty -> print'), '0\nyes\n2\nno\n');
});

test('merge builds a new hashmap where the other side wins and leaves both inputs untouched', () => {
  const source = '{"a": 1  "b": 2} => left\n{"b": 20  "c": 3} => right\nleft -> merge right -> print\nleft -> print\nright -> print';
  assert.equal(output(source), '{"a": 1  "b": 20  "c": 3}\n{"a": 1  "b": 2}\n{"b": 20  "c": 3}\n');
  assert.equal(failure('{"a": 1} -> merge [1]').message, 'the argument of `merge` must be a hashmap, got an array');
});

test('each visits key and value in insertion order, honors stop and out, and returns nothing', () => {
  assert.equal(output('{"a": 1  "b": 2  "c": 3} -> each k v\n| "{k}={v}" -> print'), 'a=1\nb=2\nc=3\n');
  assert.equal(output('{"a": 1  "b": 2  "c": 3} -> each k v\n| k = "b" ? stop\n| v -> print'), '1\n');
  assert.equal(output('({"a": 1} -> each k v | v) -> print'), 'nothing\n');
  assert.equal(output('proc find-key m target\n| m -> each k v\n| | v = target ? k -> out\n| nothing\n{"a": 1  "b": 2} -> find-key 2 -> print'), 'b\n');
  assert.equal(failure('{"a": 1} -> each k | k').message, '`lambda` expects 1 argument, got 2');
});

test('each walks a snapshot, so putting during iteration does not extend the loop', () => {
  assert.equal(output('{"a": 1  "b": 2} => m\nm -> each k v\n| m -> put "{k}{k}" v\nm -> print'), '{"a": 1  "b": 2  "aa": 1  "bb": 2}\n');
});

test('map-values builds a new hashmap with the same keys', () => {
  assert.equal(output('{"a": 1  "b": 2} => m\n(m -> map-values v | v * 10) -> print\nm -> print'), '{"a": 10  "b": 20}\n{"a": 1  "b": 2}\n');
});

test('keep filters entries into a new hashmap and demands a boolean', () => {
  const source = '{"a": 1  "b": 2  "c": 3} => m\n(m -> keep k v | v > 1) -> print\n(m -> keep k v | k = "a") -> print\nm -> print';
  assert.equal(output(source), '{"b": 2  "c": 3}\n{"a": 1}\n{"a": 1  "b": 2  "c": 3}\n');
  assert.equal(failure('{"a": 1} -> keep k v | v').message, 'the condition in `keep` must return `yes` or `no`, got an int');
});

test('copy is independent from the original', () => {
  assert.equal(output('{"a": 1} => m\nm -> copy => c\nc -> put "b" 2\nm -> put "a" 0\nm -> print\nc -> print'), '{"a": 0}\n{"a": 1  "b": 2}\n');
});

test('hashmaps print as literals with two spaces between entries', () => {
  assert.equal(output('{"a": 1  "b": 2} -> print\n{} -> print\n{"a": 1} -> show -> print\n{"k": [1 {"n": `c`}]} -> print'), '{"a": 1  "b": 2}\n{}\n{"a": 1}\n{"k": [1 {"n": `c`}]}\n');
});

test('hashmap builtins reject other receivers through dispatch', () => {
  assert.match(failure('1 -> keys').message, /^`keys` cannot be used with an int/);
  assert.match(failure('yes -> put "a" 1').message, /^`put` cannot be used with a boolean/);
  assert.match(failure('nothing -> at "a"').message, /^`at` cannot be used with a nothing/);
  assert.match(failure('[1] -> map-values v | v').message, /^`map-values` cannot be used with an array/);
});
