import { test } from 'node:test';
import assert from 'node:assert/strict';
import { failure, output } from '../helpers/run.ts';

test('to-set collapses duplicates structurally and keeps first-occurrence order', () => {
  assert.equal(output('[3 1 3 2 1] -> to-set -> print'), 'set[3 1 2]\n');
  assert.equal(output('[[1 2] "a" [1 2] 1 1.0] -> to-set -> print'), 'set[[1 2] "a" 1 1.0]\n');
  assert.equal(output('[] -> to-set -> print'), 'set[]\n');
  assert.equal(output('[1] -> to-set -> type-of -> print'), 'set\n');
});

test('to-set on a set returns an independent copy', () => {
  assert.equal(output('[1 2] -> to-set => s\ns -> to-set => c\nc -> add 3\ns -> print\nc -> print'), 'set[1 2]\nset[1 2 3]\n');
});

test('add inserts once, in place, and returns the same set', () => {
  assert.equal(output('[1] -> to-set => s\ns -> add 2 -> add 1 -> add 3 -> length -> print\ns -> print'), '3\nset[1 2 3]\n');
});

test('remove deletes in place, ignores absent values and a re-added value goes last', () => {
  assert.equal(output('[1 2 3] -> to-set => s\ns -> remove 2 -> remove 9 -> print\ns -> add 2 -> print'), 'set[1 3]\nset[1 3 2]\n');
});

test('has and contains check membership structurally', () => {
  assert.equal(output('[[1 2] "a"] -> to-set => s\ns -> has [1 2] -> print\ns -> contains [1 2] -> print\ns -> has [2 1] -> print\ns -> contains 1 -> print'), 'yes\nyes\nno\nno\n');
});

test('length and is-empty', () => {
  assert.equal(output('[] -> to-set -> length -> print\n[] -> to-set -> is-empty -> print\n[1 1 2] -> to-set -> length -> print\n[1] -> to-set -> is-empty -> print'), '0\nyes\n2\nno\n');
});

test('union, intersect and difference build new sets in left-to-right order and leave inputs untouched', () => {
  const source = '[1 2 3] -> to-set => a\n[3 4] -> to-set => b\na -> union b -> print\na -> intersect b -> print\na -> difference b -> print\nb -> difference a -> print\na -> print\nb -> print';
  assert.equal(output(source), 'set[1 2 3 4]\nset[3]\nset[1 2]\nset[4]\nset[1 2 3]\nset[3 4]\n');
  assert.equal(failure('[1] -> to-set -> union [2]').message, 'the argument of `union` must be a set, got an array');
  assert.equal(failure('[1] -> to-set -> intersect 1').message, 'the argument of `intersect` must be a set, got an int');
  assert.equal(failure('[1] -> to-set -> difference "s"').message, 'the argument of `difference` must be a set, got a string');
});

test('to-array follows insertion order', () => {
  assert.equal(output('[2 1 2] -> to-set -> to-array -> print'), '[2 1]\n');
});

test('each visits elements in insertion order, honors stop and out, and returns nothing', () => {
  assert.equal(output('[1 2 3] -> to-set -> each n | n -> print'), '1\n2\n3\n');
  assert.equal(output('[1 2 3] -> to-set -> each n\n| n = 2 ? stop\n| n -> print'), '1\n');
  assert.equal(output('([1] -> to-set -> each n | n) -> print'), 'nothing\n');
  assert.equal(output('proc first-even s\n| s -> each n\n| | n mod 2 = 0 ? n -> out\n| nothing\n[1 3 4 6] -> to-set -> first-even -> print'), '4\n');
});

test('each walks a snapshot, so adding during iteration does not extend the loop', () => {
  assert.equal(output('[1 2] -> to-set => s\ns -> each n | s -> add n * 10\ns -> print'), 'set[1 2 10 20]\n');
});

test('copy is independent from the original', () => {
  assert.equal(output('[1] -> to-set => s\ns -> copy => c\nc -> add 2\ns -> remove 1\ns -> print\nc -> print'), 'set[]\nset[1 2]\n');
});

test('sets print as set[...] with elements in show form', () => {
  assert.equal(output('[1 2 3] -> to-set -> print\n["a" `b` [1]] -> to-set -> print\n[1] -> to-set -> show -> print'), 'set[1 2 3]\nset["a" `b` [1]]\nset[1]\n');
});

test('set builtins reject other receivers through dispatch', () => {
  assert.equal(failure('1 -> to-set').message, '`to-set` cannot be used with an int; it works on array, set');
  assert.match(failure('"s" -> union "t"').message, /^`union` cannot be used with a string/);
  assert.match(failure('1 -> add 2').message, /^`add` cannot be used with an int/);
  assert.match(failure('{} -> contains 1').message, /^`contains` cannot be used with a hashmap/);
});
