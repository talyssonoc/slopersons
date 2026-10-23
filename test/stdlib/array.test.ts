import { test } from 'node:test';
import assert from 'node:assert/strict';
import { failure, output } from '../helpers/run.ts';

test('length and is-empty', () => {
  assert.equal(output('[1 2 3] -> length -> print\n[] -> length -> print'), '3\n0\n');
  assert.equal(output('[] -> is-empty -> print\n[1] -> is-empty -> print'), 'yes\nno\n');
  assert.equal(failure('[1] -> length 2').message, '`length` expects 1 argument, got 2');
});

test('at reads by index and errors when the index is missing or out of range', () => {
  assert.equal(output('[10 20 30] -> at 1 -> print\n[10 20 30] -> at 0 -> print'), '20\n10\n');
  assert.equal(failure('[10 20 30] -> at 5').message, 'index 5 is out of range for an array of length 3');
  assert.equal(failure('[] -> at 0').message, 'index 0 is out of range for an array of length 0');
  assert.equal(failure('[1] -> at (0 - 1)').message, 'the index of `at` is out of range: -1');
  assert.equal(failure('[1] -> at "x"').message, 'the index of `at` must be an int, got a string');
  assert.equal(failure('[1] -> at').message, '`at` expects 2 arguments, got 1');
});

test('put replaces in place, returns the same array and rejects out-of-range indexes', () => {
  assert.equal(output('[1 2 3] => xs\nxs -> put 1 9\nxs -> print'), '[1 9 3]\n');
  assert.equal(output('[1 2 3] -> put 0 7 -> print'), '[7 2 3]\n');
  assert.equal(failure('[1] -> put 3 0').message, 'index 3 is out of range for an array of length 1');
  assert.equal(failure('[1] -> put 1 0').message, 'index 1 is out of range for an array of length 1');
});

test('push appends in place and returns the same array so flows can chain', () => {
  assert.equal(output('[1] => xs\nxs -> push 2 -> push 3\nxs -> print'), '[1 2 3]\n');
  assert.equal(output('[] -> push "a" -> push [1] -> print'), '["a" [1]]\n');
  assert.equal(failure('1 -> push 2').message, '`push` cannot be used with an int; it works on array');
});

test('pop removes and returns the last element and errors on an empty array', () => {
  assert.equal(output('[1 2 3] => xs\nxs -> pop -> print\nxs -> print'), '3\n[1 2]\n');
  assert.equal(failure('[] -> pop').message, 'cannot pop from an empty array');
});

test('insert accepts an index up to the length and remove-at drops one element, both returning the same array', () => {
  assert.equal(output('[1 3] => xs\nxs -> insert 1 2 -> insert 3 4\nxs -> print'), '[1 2 3 4]\n');
  assert.equal(output('[] -> insert 0 "x" -> print'), '["x"]\n');
  assert.equal(failure('[1] -> insert 2 0').message, 'index 2 is out of range for an array of length 1');
  assert.equal(output('[1 2 3] => xs\nxs -> remove-at 1 -> print\nxs -> print'), '[1 3]\n[1 3]\n');
  assert.equal(failure('[1 2 3] -> remove-at 3').message, 'index 3 is out of range for an array of length 3');
});

test('mutators compose in one flow over the same array', () => {
  assert.equal(output('[1 2 3] => xs\nxs -> put 0 9 -> insert 3 4 -> remove-at 1\nxs -> print'), '[9 3 4]\n');
});

test('first and last read the ends and error on an empty array', () => {
  assert.equal(output('[1 2 3] -> first -> print\n[1 2 3] -> last -> print'), '1\n3\n');
  assert.equal(failure('[] -> first').message, 'cannot take `first` of an empty array');
  assert.equal(failure('[] -> last').message, 'cannot take `last` of an empty array');
});

test('slice clamps its bounds, excludes the end and leaves the input alone', () => {
  assert.equal(output('[1 2 3 4 5] -> slice 1 3 -> print'), '[2 3]\n');
  assert.equal(output('[1 2 3 4 5] -> slice 3 99 -> print'), '[4 5]\n');
  assert.equal(output('[1 2 3 4 5] -> slice (0 - 2) 2 -> print'), '[1 2]\n');
  assert.equal(output('[1 2 3 4 5] -> slice 4 2 -> print'), '[]\n');
  assert.equal(output('[1 2 3] => xs\nxs -> slice 0 1\nxs -> print'), '[1 2 3]\n');
  assert.equal(failure('[1 2] -> slice "a" 1').message, 'the start of `slice` must be an int, got a string');
  assert.equal(failure('[1 2] -> slice 0 1.5').message, 'the end of `slice` must be an int, got a float');
});

test('concat builds a new array', () => {
  assert.equal(output('[1 2] => a\na -> concat [3] -> print\na -> print'), '[1 2 3]\n[1 2]\n');
  assert.equal(failure('[1] -> concat 2').message, 'the argument of `concat` must be an array, got an int');
});

test('flatten removes exactly one level of nesting', () => {
  assert.equal(output('[1 [2 [3]] [] 4] -> flatten -> print'), '[1 2 [3] 4]\n');
  assert.equal(output('[] -> flatten -> print'), '[]\n');
});

test('zip pairs elements up to the shorter length', () => {
  assert.equal(output('[1 2 3] -> zip ["a" "b"] -> print'), '[[1 "a"] [2 "b"]]\n');
  assert.equal(output('[] -> zip [1] -> print'), '[]\n');
  assert.equal(failure('[1] -> zip "ab"').message, 'the argument of `zip` must be an array, got a string');
});

test('contains and index-of use structural equality', () => {
  assert.equal(output('[1 [2 3]] -> contains [2 3] -> print\n[1 [2 3]] -> contains 4 -> print'), 'yes\nno\n');
  assert.equal(output('[1] -> contains 1.0 -> print'), 'no\n');
  assert.equal(output('["a" "b" "b"] -> index-of "b" -> print\n["a" "b"] -> index-of "z" -> print'), '1\nnothing\n');
  assert.equal(output('[[1] [2]] -> index-of [2] -> print'), '1\n');
});

test('sum adds ints and floats with the promotion rules of +', () => {
  assert.equal(output('[1 2 3] -> sum -> print'), '6\n');
  assert.equal(output('[] -> sum -> print'), '0\n');
  assert.equal(output('[1 2.5] -> sum -> print'), '3.5\n');
  assert.equal(output('[1 2.0] -> sum -> print'), '3.0\n');
  assert.equal(output('[99999999999999999999 1] -> sum -> print'), '100000000000000000000\n');
  assert.equal(failure('[1 "a"] -> sum').message, '`sum` needs an array of numbers, but found a string');
});

test('min and max follow value ordering, keep the first of equal elements and error on an empty array', () => {
  assert.equal(output('[3 1 2] -> min -> print\n[3 1 2] -> max -> print'), '1\n3\n');
  assert.equal(output('["b" "a" "c"] -> min -> print\n["b" "a" "c"] -> max -> print'), 'a\nc\n');
  assert.equal(output('[2.5 1 3.0] -> min -> print\n[2.5 1 3.0] -> max -> print'), '1\n3.0\n');
  assert.equal(output('[1 1.0] -> min -> print\n[1.0 1] -> max -> print'), '1\n1.0\n');
  assert.equal(failure('[] -> min').message, 'cannot take `min` of an empty array');
  assert.equal(failure('[] -> max').message, 'cannot take `max` of an empty array');
  assert.equal(failure('[1 "a"] -> max').message, 'cannot compare a string with an int');
});

test('unique keeps first occurrences by structural equality', () => {
  assert.equal(output('[1 2 1 3 2] -> unique -> print'), '[1 2 3]\n');
  assert.equal(output('[[1] [1] [2]] -> unique -> print'), '[[1] [2]]\n');
  assert.equal(output('[1 1.0 "1"] -> unique -> print'), '[1 1.0 "1"]\n');
  assert.equal(output('[1 1] => xs\nxs -> unique\nxs -> print'), '[1 1]\n');
});

test('reverse returns a new array', () => {
  assert.equal(output('[1 2 3] => xs\nxs -> reverse -> print\nxs -> print'), '[3 2 1]\n[1 2 3]\n');
  assert.equal(output('[] -> reverse -> print'), '[]\n');
});

test('join concatenates strings with a separator and rejects other elements', () => {
  assert.equal(output('["a" "b" "c"] -> join ", " -> print'), 'a, b, c\n');
  assert.equal(output('["a"] -> join ", " -> print\n[] -> join ", " -> print'), 'a\n\n');
  assert.equal(failure('["a" 1] -> join ","').message, '`join` needs an array of strings, but found an int');
  assert.equal(failure('["a" `b`] -> join ","').message, '`join` needs an array of strings, but found a char');
  assert.equal(failure('["a"] -> join 1').message, 'the separator of `join` must be a string, got an int');
});

test('sort orders by value ordering into a new array and errors on incomparable elements', () => {
  assert.equal(output('[3 1 2] => xs\nxs -> sort -> print\nxs -> print'), '[1 2 3]\n[3 1 2]\n');
  assert.equal(output('["b" "a"] -> sort -> print'), '["a" "b"]\n');
  assert.equal(output('[2 1.5 1] -> sort -> print'), '[1 1.5 2]\n');
  assert.equal(output('[[2 1] [1 9] [1 2]] -> sort -> print'), '[[1 2] [1 9] [2 1]]\n');
  assert.equal(failure('[1 "a"] -> sort').message, 'cannot compare an int with a string');
});

test('sort-by takes a before predicate, is stable and requires a boolean', () => {
  assert.equal(output('[1 3 2] -> sort-by (a b | a > b) -> print'), '[3 2 1]\n');
  const records = '[["b" 2] ["a" 1] ["c" 2] ["d" 1]]';
  assert.equal(output(`${records} -> sort-by (a b | (a -> at 1) < (b -> at 1)) -> print`), '[["a" 1] ["d" 1] ["b" 2] ["c" 2]]\n');
  assert.equal(output(`${records} -> sort-by (a b | (a -> at 1) > (b -> at 1)) -> print`), '[["b" 2] ["c" 2] ["a" 1] ["d" 1]]\n');
  assert.equal(output('proc desc xs\n| xs -> sort-by a b\n| | a > b\n[1 3 2] -> desc -> print'), '[3 2 1]\n');
  assert.equal(failure('[1 2] -> sort-by (a b | 1)').message, 'the comparison in `sort-by` must return `yes` or `no`, got an int');
  assert.equal(failure('[1 2] -> sort-by 1').message, 'the body of `sort-by` must be a procedure, got an int');
});

test('map builds a new array from the lambda results', () => {
  assert.equal(output('[1 2 3] => xs\nxs -> map (n | n * 2) -> print\nxs -> print'), '[2 4 6]\n[1 2 3]\n');
  assert.equal(output('proc doubled xs\n| xs -> map n | n * 2\n[1 2] -> doubled -> print'), '[2 4]\n');
  assert.equal(output('[] -> map (n | n) -> print'), '[]\n');
  assert.equal(failure('[1] -> map 2').message, 'the body of `map` must be a procedure, got an int');
});

test('keep and reject filter by a boolean condition', () => {
  assert.equal(output('[1 2 3 4] -> keep (n | n mod 2 = 0) -> print'), '[2 4]\n');
  assert.equal(output('[1 2 3 4] -> reject (n | n mod 2 = 0) -> print'), '[1 3]\n');
  assert.equal(failure('[1] -> keep (n | n)').message, 'the condition in `keep` must return `yes` or `no`, got an int');
  assert.equal(failure('[1] -> reject (n | "x")').message, 'the condition in `reject` must return `yes` or `no`, got a string');
});

test('reduce threads an accumulator through the elements', () => {
  assert.equal(output('proc total xs\n| xs -> reduce 0 acc n\n| | acc + n\n[1 2 3] -> total -> print'), '6\n');
  assert.equal(output('([1 2 3] -> reduce 0 (acc n | acc + n)) -> print'), '6\n');
  assert.equal(output('["a" "b"] -> reduce "" (acc s | acc + s) -> print'), 'ab\n');
  assert.equal(output('[] -> reduce "start" (acc n | acc + n) -> print'), 'start\n');
  assert.equal(failure('[1] -> reduce 0 1').message, 'the body of `reduce` must be a procedure, got an int');
});

test('any stops at the first match and all at the first miss', () => {
  const anySource = 'proc check xs\n| xs -> any n\n| | n = 3 ? "went past the match" -> fail\n| | n = 2\n[1 2 3] -> check -> print\n[1] -> check -> print\n[] -> check -> print';
  assert.equal(output(anySource), 'yes\nno\nno\n');
  const allSource = 'proc check xs\n| xs -> all n\n| | n = 3 ? "went past the miss" -> fail\n| | n < 2\n[1 2 3] -> check -> print\n[1 1] -> check -> print\n[] -> check -> print';
  assert.equal(output(allSource), 'no\nyes\nyes\n');
  assert.equal(failure('[1] -> any (n | 1)').message, 'the condition in `any` must return `yes` or `no`, got an int');
  assert.equal(failure('[1] -> all (n | nothing)').message, 'the condition in `all` must return `yes` or `no`, got a nothing');
});

test('find returns the first match or nothing, count tallies matches', () => {
  assert.equal(output('[1 2 3] -> find (n | n > 1) -> print\n[1 2 3] -> find (n | n > 5) -> print'), '2\nnothing\n');
  assert.equal(output('[1 2 3 4] -> count (n | n > 2) -> print\n[] -> count (n | yes) -> print'), '2\n0\n');
  assert.equal(failure('[1] -> find (n | 0)').message, 'the condition in `find` must return `yes` or `no`, got an int');
  assert.equal(failure('[1] -> count (n | 0)').message, 'the condition in `count` must return `yes` or `no`, got an int');
});

test('with-index pairs each element with its position so each can see indexes', () => {
  assert.equal(output('["a" "b"] -> with-index -> print'), '[[0 "a"] [1 "b"]]\n');
  assert.equal(output('["a" "b"] -> with-index -> each pair | "{pair -> at 0}:{pair -> at 1}" -> print'), '0:a\n1:b\n');
});

test('copy is shallow', () => {
  assert.equal(output('[1 2] => a\na -> copy => b\nb -> push 3\na -> print\nb -> print'), '[1 2]\n[1 2 3]\n');
  assert.equal(output('[[1]] => a\na -> copy => b\nb -> at 0 -> push 2\na -> print'), '[[1 2]]\n');
});

test('stop raised inside a lambda given to map propagates to the enclosing loop', () => {
  assert.equal(output('[1 2] -> each n\n| [5] -> map (x | stop)\n| "not reached" -> print\n"done" -> print'), 'done\n');
  assert.equal(failure('[1] -> keep (x | stop)').message, '`stop` outside of a loop');
});

test('type errors name the builtin and the offending type', () => {
  assert.equal(failure('"ab" -> flatten').message, '`flatten` cannot be used with a string; it works on array');
  assert.equal(failure('1 -> sort').message, '`sort` cannot be used with an int; it works on array');
  assert.equal(failure('nothing -> with-index').message, '`with-index` cannot be used with a nothing; it works on array');
});
