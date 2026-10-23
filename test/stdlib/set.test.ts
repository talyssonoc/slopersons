import { test } from 'node:test';
import assert from 'node:assert/strict';
import { failure, output } from '../helpers/run.ts';

test('array/to-set collapses duplicates structurally and keeps first-occurrence order', () => {
  assert.equal(output('[3 1 3 2 1] -> array/to-set -> io/print-ln'), 'set[3 1 2]\n');
  assert.equal(output('[[1 2] "a" [1 2] 1 1.0] -> array/to-set -> io/print-ln'), 'set[[1 2] "a" 1 1.0]\n');
  assert.equal(output('[] -> array/to-set -> io/print-ln'), 'set[]\n');
  assert.equal(output('[1] -> array/to-set -> type-of -> io/print-ln'), 'set\n');
});

test('array/to-set only accepts an array, so a set is copied with set/copy instead', () => {
  assert.equal(failure('[1 2] -> array/to-set -> array/to-set').message, 'the input of `array/to-set` must be an array, got a set');
  assert.equal(failure('1 -> array/to-set').message, 'the input of `array/to-set` must be an array, got an int');
});

test('set/add inserts once, in place, and returns the same set', () => {
  assert.equal(output('[1] -> array/to-set => s\ns -> set/add 2 -> set/add 1 -> set/add 3 -> set/length -> io/print-ln\ns -> io/print-ln'), '3\nset[1 2 3]\n');
});

test('set/remove deletes in place, ignores absent values and a re-added value goes last', () => {
  assert.equal(output('[1 2 3] -> array/to-set => s\ns -> set/remove 2 -> set/remove 9 -> io/print-ln\ns -> set/add 2 -> io/print-ln'), 'set[1 3]\nset[1 3 2]\n');
});

test('set/has checks membership structurally', () => {
  assert.equal(output('[[1 2] "a"] -> array/to-set => s\ns -> set/has [1 2] -> io/print-ln\ns -> set/has "a" -> io/print-ln\ns -> set/has [2 1] -> io/print-ln\ns -> set/has 1 -> io/print-ln'), 'yes\nyes\nno\nno\n');
});

test('set/length and set/is-empty', () => {
  assert.equal(output('[] -> array/to-set -> set/length -> io/print-ln\n[] -> array/to-set -> set/is-empty -> io/print-ln\n[1 1 2] -> array/to-set -> set/length -> io/print-ln\n[1] -> array/to-set -> set/is-empty -> io/print-ln'), '0\nyes\n2\nno\n');
});

test('set/union, set/intersect and set/difference build new sets in left-to-right order and leave inputs untouched', () => {
  const source = '[1 2 3] -> array/to-set => a\n[3 4] -> array/to-set => b\na -> set/union b -> io/print-ln\na -> set/intersect b -> io/print-ln\na -> set/difference b -> io/print-ln\nb -> set/difference a -> io/print-ln\na -> io/print-ln\nb -> io/print-ln';
  assert.equal(output(source), 'set[1 2 3 4]\nset[3]\nset[1 2]\nset[4]\nset[1 2 3]\nset[3 4]\n');
  assert.equal(failure('[1] -> array/to-set -> set/union [2]').message, 'the argument of `set/union` must be a set, got an array');
  assert.equal(failure('[1] -> array/to-set -> set/intersect 1').message, 'the argument of `set/intersect` must be a set, got an int');
  assert.equal(failure('[1] -> array/to-set -> set/difference "s"').message, 'the argument of `set/difference` must be a set, got a string');
});

test('set/to-array follows insertion order', () => {
  assert.equal(output('[2 1 2] -> array/to-set -> set/to-array -> io/print-ln'), '[2 1]\n');
});

test('set/each visits elements in insertion order, honors stop and out, and returns nothing', () => {
  assert.equal(output('[1 2 3] -> array/to-set -> set/each n | n -> io/print-ln'), '1\n2\n3\n');
  assert.equal(output('[1 2 3] -> array/to-set -> set/each n\n| n = 2 ? stop\n| n -> io/print-ln'), '1\n');
  assert.equal(output('([1] -> array/to-set -> set/each n | n) -> io/print-ln'), 'nothing\n');
  assert.equal(output('proc first-even s\n| s -> set/each n\n| | n mod 2 = 0 ? n -> out\n| nothing\n[1 3 4 6] -> array/to-set -> first-even -> io/print-ln'), '4\n');
});

test('set/each walks a snapshot, so adding during iteration does not extend the loop', () => {
  assert.equal(output('[1 2] -> array/to-set => s\ns -> set/each n | s -> set/add n * 10\ns -> io/print-ln'), 'set[1 2 10 20]\n');
});

test('set/copy is independent from the original', () => {
  assert.equal(output('[1] -> array/to-set => s\ns -> set/copy => c\nc -> set/add 2\ns -> set/remove 1\ns -> io/print-ln\nc -> io/print-ln'), 'set[]\nset[1 2]\n');
});

test('sets print as set[...] with elements in show form', () => {
  assert.equal(output('[1 2 3] -> array/to-set -> io/print-ln\n["a" `b` [1]] -> array/to-set -> io/print-ln\n[1] -> array/to-set -> show -> io/print-ln'), 'set[1 2 3]\nset["a" `b` [1]]\nset[1]\n');
});

test('set functions reject an input that is not a set, naming the qualified function', () => {
  assert.equal(failure('"s" -> set/union "t"').message, 'the input of `set/union` must be a set, got a string');
  assert.equal(failure('1 -> set/add 2').message, 'the input of `set/add` must be a set, got an int');
  assert.equal(failure('{} -> set/has 1').message, 'the input of `set/has` must be a set, got a hashmap');
  assert.equal(failure('[1] -> set/each n | n').message, 'the input of `set/each` must be a set, got an array');
});

test('set functions check their arity under the qualified name', () => {
  assert.equal(failure('[1] -> array/to-set -> set/add').message, '`set/add` expects 2 arguments, got 1');
  assert.equal(failure('[1] -> array/to-set -> set/length 1').message, '`set/length` expects 1 argument, got 2');
});

test('the bare names and set/contains are gone', () => {
  assert.equal(failure('[1] -> to-set').message, 'unknown name `to-set`');
  assert.equal(failure('[1] -> array/to-set -> set/contains 1').message, 'module `set` has no exported name `contains`');
});
