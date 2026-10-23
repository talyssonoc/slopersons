import { test } from 'node:test';
import assert from 'node:assert/strict';
import { failure, output } from '../helpers/run.ts';

test('length and is-empty', () => {
  assert.equal(output('[1 2 3] -> array/length -> io/print-line\n[] -> array/length -> io/print-line'), '3\n0\n');
  assert.equal(output('[] -> array/is-empty -> io/print-line\n[1] -> array/is-empty -> io/print-line'), 'yes\nno\n');
  assert.equal(failure('[1] -> array/length 2').message, '`array/length` expects 1 argument, got 2');
});

test('at reads by index and errors when the index is missing or out of range', () => {
  assert.equal(output('[10 20 30] -> array/at 1 -> io/print-line\n[10 20 30] -> array/at 0 -> io/print-line'), '20\n10\n');
  assert.equal(failure('[10 20 30] -> array/at 5').message, 'index 5 is out of range for an array of length 3');
  assert.equal(failure('[] -> array/at 0').message, 'index 0 is out of range for an array of length 0');
  assert.equal(failure('[1] -> array/at (0 - 1)').message, 'the index of `array/at` is out of range: -1');
  assert.equal(failure('[1] -> array/at "x"').message, 'the index of `array/at` must be an int, got a string');
  assert.equal(failure('[1] -> array/at').message, '`array/at` expects 2 arguments, got 1');
});

test('put replaces in place, returns the same array and rejects out-of-range indexes', () => {
  assert.equal(output('[1 2 3] => xs\nxs -> array/put 1 9\nxs -> io/print-line'), '[1 9 3]\n');
  assert.equal(output('[1 2 3] -> array/put 0 7 -> io/print-line'), '[7 2 3]\n');
  assert.equal(failure('[1] -> array/put 3 0').message, 'index 3 is out of range for an array of length 1');
  assert.equal(failure('[1] -> array/put 1 0').message, 'index 1 is out of range for an array of length 1');
});

test('push appends in place and returns the same array so flows can chain', () => {
  assert.equal(output('[1] => xs\nxs -> array/push 2 -> array/push 3\nxs -> io/print-line'), '[1 2 3]\n');
  assert.equal(output('[] -> array/push "a" -> array/push [1] -> io/print-line'), '["a" [1]]\n');
  assert.equal(failure('1 -> array/push 2').message, 'the input of `array/push` must be an array, got an int');
});

test('pop removes and returns the last element and errors on an empty array', () => {
  assert.equal(output('[1 2 3] => xs\nxs -> array/pop -> io/print-line\nxs -> io/print-line'), '3\n[1 2]\n');
  assert.equal(failure('[] -> array/pop').message, 'cannot pop from an empty array');
});

test('insert accepts an index up to the length and remove-at drops one element, both returning the same array', () => {
  assert.equal(output('[1 3] => xs\nxs -> array/insert 1 2 -> array/insert 3 4\nxs -> io/print-line'), '[1 2 3 4]\n');
  assert.equal(output('[] -> array/insert 0 "x" -> io/print-line'), '["x"]\n');
  assert.equal(failure('[1] -> array/insert 2 0').message, 'index 2 is out of range for an array of length 1');
  assert.equal(output('[1 2 3] => xs\nxs -> array/remove-at 1 -> io/print-line\nxs -> io/print-line'), '[1 3]\n[1 3]\n');
  assert.equal(failure('[1 2 3] -> array/remove-at 3').message, 'index 3 is out of range for an array of length 3');
});

test('mutators compose in one flow over the same array', () => {
  assert.equal(output('[1 2 3] => xs\nxs -> array/put 0 9 -> array/insert 3 4 -> array/remove-at 1\nxs -> io/print-line'), '[9 3 4]\n');
});

test('first and last read the ends and error on an empty array', () => {
  assert.equal(output('[1 2 3] -> array/first -> io/print-line\n[1 2 3] -> array/last -> io/print-line'), '1\n3\n');
  assert.equal(failure('[] -> array/first').message, 'cannot take `array/first` of an empty array');
  assert.equal(failure('[] -> array/last').message, 'cannot take `array/last` of an empty array');
});

test('slice clamps its bounds, excludes the end and leaves the input alone', () => {
  assert.equal(output('[1 2 3 4 5] -> array/slice 1 3 -> io/print-line'), '[2 3]\n');
  assert.equal(output('[1 2 3 4 5] -> array/slice 3 99 -> io/print-line'), '[4 5]\n');
  assert.equal(output('[1 2 3 4 5] -> array/slice (0 - 2) 2 -> io/print-line'), '[1 2]\n');
  assert.equal(output('[1 2 3 4 5] -> array/slice 4 2 -> io/print-line'), '[]\n');
  assert.equal(output('[1 2 3] => xs\nxs -> array/slice 0 1\nxs -> io/print-line'), '[1 2 3]\n');
  assert.equal(failure('[1 2] -> array/slice "a" 1').message, 'the start of `array/slice` must be an int, got a string');
  assert.equal(failure('[1 2] -> array/slice 0 1.5').message, 'the end of `array/slice` must be an int, got a float');
});

test('concat builds a new array', () => {
  assert.equal(output('[1 2] => a\na -> array/concat [3] -> io/print-line\na -> io/print-line'), '[1 2 3]\n[1 2]\n');
  assert.equal(failure('[1] -> array/concat 2').message, 'the argument of `array/concat` must be an array, got an int');
});

test('flatten removes exactly one level of nesting', () => {
  assert.equal(output('[1 [2 [3]] [] 4] -> array/flatten -> io/print-line'), '[1 2 [3] 4]\n');
  assert.equal(output('[] -> array/flatten -> io/print-line'), '[]\n');
});

test('zip pairs elements up to the shorter length', () => {
  assert.equal(output('[1 2 3] -> array/zip ["a" "b"] -> io/print-line'), '[[1 "a"] [2 "b"]]\n');
  assert.equal(output('[] -> array/zip [1] -> io/print-line'), '[]\n');
  assert.equal(failure('[1] -> array/zip "ab"').message, 'the argument of `array/zip` must be an array, got a string');
});

test('contains and index-of use structural equality', () => {
  assert.equal(output('[1 [2 3]] -> array/contains [2 3] -> io/print-line\n[1 [2 3]] -> array/contains 4 -> io/print-line'), 'yes\nno\n');
  assert.equal(output('[1] -> array/contains 1.0 -> io/print-line'), 'no\n');
  assert.equal(output('["a" "b" "b"] -> array/index-of "b" -> io/print-line\n["a" "b"] -> array/index-of "z" -> io/print-line'), '1\nnothing\n');
  assert.equal(output('[[1] [2]] -> array/index-of [2] -> io/print-line'), '1\n');
});

test('sum adds ints and floats with the promotion rules of +', () => {
  assert.equal(output('[1 2 3] -> array/sum -> io/print-line'), '6\n');
  assert.equal(output('[] -> array/sum -> io/print-line'), '0\n');
  assert.equal(output('[1 2.5] -> array/sum -> io/print-line'), '3.5\n');
  assert.equal(output('[1 2.0] -> array/sum -> io/print-line'), '3.0\n');
  assert.equal(output('[99999999999999999999 1] -> array/sum -> io/print-line'), '100000000000000000000\n');
  assert.equal(failure('[1 "a"] -> array/sum').message, '`array/sum` needs an array of numbers, but found a string');
});

test('min and max follow value ordering, keep the first of equal elements and error on an empty array', () => {
  assert.equal(output('[3 1 2] -> array/min -> io/print-line\n[3 1 2] -> array/max -> io/print-line'), '1\n3\n');
  assert.equal(output('["b" "a" "c"] -> array/min -> io/print-line\n["b" "a" "c"] -> array/max -> io/print-line'), 'a\nc\n');
  assert.equal(output('[2.5 1 3.0] -> array/min -> io/print-line\n[2.5 1 3.0] -> array/max -> io/print-line'), '1\n3.0\n');
  assert.equal(output('[1 1.0] -> array/min -> io/print-line\n[1.0 1] -> array/max -> io/print-line'), '1\n1.0\n');
  assert.equal(failure('[] -> array/min').message, 'cannot take `array/min` of an empty array');
  assert.equal(failure('[] -> array/max').message, 'cannot take `array/max` of an empty array');
  assert.equal(failure('[1 "a"] -> array/max').message, 'cannot compare a string with an int');
});

test('unique keeps first occurrences by structural equality', () => {
  assert.equal(output('[1 2 1 3 2] -> array/unique -> io/print-line'), '[1 2 3]\n');
  assert.equal(output('[[1] [1] [2]] -> array/unique -> io/print-line'), '[[1] [2]]\n');
  assert.equal(output('[1 1.0 "1"] -> array/unique -> io/print-line'), '[1 1.0 "1"]\n');
  assert.equal(output('[1 1] => xs\nxs -> array/unique\nxs -> io/print-line'), '[1 1]\n');
});

test('reverse returns a new array', () => {
  assert.equal(output('[1 2 3] => xs\nxs -> array/reverse -> io/print-line\nxs -> io/print-line'), '[3 2 1]\n[1 2 3]\n');
  assert.equal(output('[] -> array/reverse -> io/print-line'), '[]\n');
});

test('join concatenates strings with a separator and rejects other elements', () => {
  assert.equal(output('["a" "b" "c"] -> array/join ", " -> io/print-line'), 'a, b, c\n');
  assert.equal(output('["a"] -> array/join ", " -> io/print-line\n[] -> array/join ", " -> io/print-line'), 'a\n\n');
  assert.equal(failure('["a" 1] -> array/join ","').message, '`array/join` needs an array of strings, but found an int');
  assert.equal(failure('["a" `b`] -> array/join ","').message, '`array/join` needs an array of strings, but found a char');
  assert.equal(failure('["a"] -> array/join 1').message, 'the separator of `array/join` must be a string, got an int');
});

test('sort orders by value ordering into a new array and errors on incomparable elements', () => {
  assert.equal(output('[3 1 2] => xs\nxs -> array/sort -> io/print-line\nxs -> io/print-line'), '[1 2 3]\n[3 1 2]\n');
  assert.equal(output('["b" "a"] -> array/sort -> io/print-line'), '["a" "b"]\n');
  assert.equal(output('[2 1.5 1] -> array/sort -> io/print-line'), '[1 1.5 2]\n');
  assert.equal(output('[[2 1] [1 9] [1 2]] -> array/sort -> io/print-line'), '[[1 2] [1 9] [2 1]]\n');
  assert.equal(failure('[1 "a"] -> array/sort').message, 'cannot compare an int with a string');
});

test('sort-by takes a before predicate, is stable and requires a boolean', () => {
  assert.equal(output('[1 3 2] -> array/sort-by (a b | a > b) -> io/print-line'), '[3 2 1]\n');
  const records = '[["b" 2] ["a" 1] ["c" 2] ["d" 1]]';
  assert.equal(output(`${records} -> array/sort-by (a b | (a -> array/at 1) < (b -> array/at 1)) -> io/print-line`), '[["a" 1] ["d" 1] ["b" 2] ["c" 2]]\n');
  assert.equal(output(`${records} -> array/sort-by (a b | (a -> array/at 1) > (b -> array/at 1)) -> io/print-line`), '[["b" 2] ["c" 2] ["a" 1] ["d" 1]]\n');
  assert.equal(output('proc desc xs\n| xs -> array/sort-by a b\n| | a > b\n[1 3 2] -> desc -> io/print-line'), '[3 2 1]\n');
  assert.equal(failure('[1 2] -> array/sort-by (a b | 1)').message, 'the comparison in `array/sort-by` must return `yes` or `no`, got an int');
  assert.equal(failure('[1 2] -> array/sort-by 1').message, 'the body of `array/sort-by` must be a procedure, got an int');
});

test('each calls the body per element in order, returns nothing and stops early on stop', () => {
  assert.equal(output('[1 2 3] -> array/each n\n| n * 10 -> io/print-line'), '10\n20\n30\n');
  assert.equal(output('[1 2] -> array/each (n | n) -> io/print-line'), 'nothing\n');
  assert.equal(output('[1 2 3] -> array/each n\n| n = 2 ? stop\n| n -> io/print-line'), '1\n');
  assert.equal(failure('1 -> array/each (n | n)').message, 'the input of `array/each` must be an array, got an int');
  assert.equal(failure('[1] -> array/each 1').message, 'the body of `array/each` must be a procedure, got an int');
  assert.equal(failure('[1] -> array/each').message, '`array/each` expects 2 arguments, got 1');
});

test('map builds a new array from the lambda results', () => {
  assert.equal(output('[1 2 3] => xs\nxs -> array/map (n | n * 2) -> io/print-line\nxs -> io/print-line'), '[2 4 6]\n[1 2 3]\n');
  assert.equal(output('proc doubled xs\n| xs -> array/map n | n * 2\n[1 2] -> doubled -> io/print-line'), '[2 4]\n');
  assert.equal(output('[1 2 3] -> array/map n | n * 2\n-> io/print-line'), '[2 4 6]\n');
  assert.equal(output('[] -> array/map (n | n) -> io/print-line'), '[]\n');
  assert.equal(failure('[1] -> array/map 2').message, 'the body of `array/map` must be a procedure, got an int');
});

test('keep and reject filter by a boolean condition', () => {
  assert.equal(output('[1 2 3 4] -> array/keep (n | n mod 2 = 0) -> io/print-line'), '[2 4]\n');
  assert.equal(output('[1 2 3 4] -> array/reject (n | n mod 2 = 0) -> io/print-line'), '[1 3]\n');
  assert.equal(failure('[1] -> array/keep (n | n)').message, 'the condition in `array/keep` must return `yes` or `no`, got an int');
  assert.equal(failure('[1] -> array/reject (n | "x")').message, 'the condition in `array/reject` must return `yes` or `no`, got a string');
});

test('reduce threads an accumulator through the elements', () => {
  assert.equal(output('proc total xs\n| xs -> array/reduce 0 acc n\n| | acc + n\n[1 2 3] -> total -> io/print-line'), '6\n');
  assert.equal(output('([1 2 3] -> array/reduce 0 (acc n | acc + n)) -> io/print-line'), '6\n');
  assert.equal(output('["a" "b"] -> array/reduce "" (acc s | acc + s) -> io/print-line'), 'ab\n');
  assert.equal(output('[] -> array/reduce "start" (acc n | acc + n) -> io/print-line'), 'start\n');
  assert.equal(failure('[1] -> array/reduce 0 1').message, 'the body of `array/reduce` must be a procedure, got an int');
});

test('any stops at the first match and all at the first miss', () => {
  const anySource = 'proc check xs\n| xs -> array/any n\n| | n = 3 ? "went past the match" -> fail\n| | n = 2\n[1 2 3] -> check -> io/print-line\n[1] -> check -> io/print-line\n[] -> check -> io/print-line';
  assert.equal(output(anySource), 'yes\nno\nno\n');
  const allSource = 'proc check xs\n| xs -> array/all n\n| | n = 3 ? "went past the miss" -> fail\n| | n < 2\n[1 2 3] -> check -> io/print-line\n[1 1] -> check -> io/print-line\n[] -> check -> io/print-line';
  assert.equal(output(allSource), 'no\nyes\nyes\n');
  assert.equal(failure('[1] -> array/any (n | 1)').message, 'the condition in `array/any` must return `yes` or `no`, got an int');
  assert.equal(failure('[1] -> array/all (n | nothing)').message, 'the condition in `array/all` must return `yes` or `no`, got a nothing');
});

test('find returns the first match or nothing, count tallies matches', () => {
  assert.equal(output('[1 2 3] -> array/find (n | n > 1) -> io/print-line\n[1 2 3] -> array/find (n | n > 5) -> io/print-line'), '2\nnothing\n');
  assert.equal(output('[1 2 3 4] -> array/count (n | n > 2) -> io/print-line\n[] -> array/count (n | yes) -> io/print-line'), '2\n0\n');
  assert.equal(failure('[1] -> array/find (n | 0)').message, 'the condition in `array/find` must return `yes` or `no`, got an int');
  assert.equal(failure('[1] -> array/count (n | 0)').message, 'the condition in `array/count` must return `yes` or `no`, got an int');
});

test('with-index pairs each element with its position so each can see indexes', () => {
  assert.equal(output('["a" "b"] -> array/with-index -> io/print-line'), '[[0 "a"] [1 "b"]]\n');
  assert.equal(output('["a" "b"] -> array/with-index -> array/each pair | "{pair -> array/at 0}:{pair -> array/at 1}" -> io/print-line'), '0:a\n1:b\n');
});

test('copy is shallow', () => {
  assert.equal(output('[1 2] => a\na -> array/copy => b\nb -> array/push 3\na -> io/print-line\nb -> io/print-line'), '[1 2]\n[1 2 3]\n');
  assert.equal(output('[[1]] => a\na -> array/copy => b\nb -> array/at 0 -> array/push 2\na -> io/print-line'), '[[1 2]]\n');
});

test('stop raised inside a lambda given to map propagates to the enclosing loop', () => {
  assert.equal(output('[1 2] -> array/each n\n| [5] -> array/map (x | stop)\n| "not reached" -> io/print-line\n"done" -> io/print-line'), 'done\n');
  assert.equal(failure('[1] -> array/keep (x | stop)').message, '`stop` outside of a loop');
});

test('type errors name the qualified builtin and the offending type', () => {
  assert.equal(failure('"ab" -> array/flatten').message, 'the input of `array/flatten` must be an array, got a string');
  assert.equal(failure('1 -> array/sort').message, 'the input of `array/sort` must be an array, got an int');
  assert.equal(failure('nothing -> array/with-index').message, 'the input of `array/with-index` must be an array, got a nothing');
});
