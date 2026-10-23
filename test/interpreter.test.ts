import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Interpreter } from '../src/interpreter.ts';
import { NOTHING } from '../src/values.ts';
import { failure, fakeIo, output } from './helpers/run.ts';

test('print writes without a newline and passes its value on', () => {
  assert.equal(output('"a" -> print -> print\n1 -> print\n"" -> print-ln\n[1] -> print'), 'aa1\n[1]');
});

test('literals print-ln in their human form', () => {
  assert.equal(output('42 -> print-ln\n3.5 -> print-ln\n2.0 -> print-ln\n"hi" -> print-ln\n`a` -> print-ln\nyes -> print-ln\nnothing -> print-ln'), '42\n3.5\n2.0\nhi\na\nyes\nnothing\n');
  assert.equal(output('[1 2.5 `x` "s" yes nothing] -> print-ln'), '[1 2.5 `x` "s" yes nothing]\n');
  assert.equal(output('{"a": 1  2: "two"} -> print-ln'), '{"a": 1  2: "two"}\n');
  assert.equal(output('"tab\\tquote\\"" -> show -> print-ln'), '"tab\\tquote\\""\n');
});

test('int arithmetic is arbitrary precision with floor division and floored mod', () => {
  assert.equal(output('99999999999999999999 * 99999999999999999999 -> print-ln'), '9999999999999999999800000000000000000001\n');
  assert.equal(output('7 / 2 -> print-ln\n-7 / 2 -> print-ln\n7 / -2 -> print-ln'), '3\n-4\n-4\n');
  assert.equal(output('7 mod 3 -> print-ln\n-7 mod 3 -> print-ln\n7 mod -3 -> print-ln'), '1\n2\n-2\n');
  assert.equal(output('1 + 2 * 3 - 4 -> print-ln'), '3\n');
});

test('a float operand promotes the result and floats always print-ln with a point', () => {
  assert.equal(output('7.0 / 2 -> print-ln\n1 + 0.5 -> print-ln\n3 * 2.0 -> print-ln\n-7.5 mod 2 -> print-ln'), '3.5\n1.5\n6.0\n0.5\n');
});

test('division and mod by zero are errors with positions', () => {
  const error = failure('1 => x\nx / 0 -> print-ln');
  assert.equal(error.message, 'division by zero');
  assert.deepEqual(error.pos, { line: 2, col: 3 });
  assert.equal(failure('1.0 mod 0').message, '`mod` by zero');
});

test('+ concatenates strings and nothing else coerces', () => {
  assert.equal(output('"a" + "b" -> print-ln'), 'ab\n');
  assert.equal(failure('"a" + 1').message, 'cannot add a string and an int');
  assert.equal(failure('1 - "a"').message, 'cannot subtract an int and a string');
  assert.equal(failure('-"a"').message, 'cannot negate a string');
});

test('equality is deep and structural, and different types are simply unequal', () => {
  assert.equal(output('[1 [2 "x"]] = [1 [2 "x"]] -> print-ln'), 'yes\n');
  assert.equal(output('{"a": [1]} = {"a": [1]} -> print-ln'), 'yes\n');
  assert.equal(output('1 = 1.0 -> print-ln\n1 /= "1" -> print-ln\nnothing = nothing -> print-ln'), 'no\nyes\nyes\n');
});

test('ordering works within numbers, strings, chars, dates and arrays, and errors across types', () => {
  assert.equal(output('1 < 2.5 -> print-ln\n"b" > "a" -> print-ln\n`a` <= `b` -> print-ln\n[1 2] < [1 3] -> print-ln\n2 >= 2 -> print-ln'), 'yes\nyes\nyes\nyes\nyes\n');
  assert.equal(output('"👍" > "z" -> print-ln'), 'yes\n');
  assert.equal(failure('1 < "a"').message, 'cannot compare an int with a string');
  assert.equal(failure('yes < no').message, 'cannot compare a boolean with a boolean');
});

test('and/or need booleans and short-circuit', () => {
  assert.equal(output('yes and no -> print-ln\nno or yes -> print-ln\nnot yes -> print-ln'), 'no\nyes\nno\n');
  assert.equal(output('no and (1 / 0 = 0) -> print-ln\nyes or (1 / 0 = 0) -> print-ln'), 'no\nyes\n');
  assert.equal(failure('1 and yes').message, '`and` needs booleans, got an int');
  assert.equal(failure('not 1').message, '`not` needs a boolean, got an int');
});

test('conditions must be booleans', () => {
  assert.equal(failure('1 ? "x" -> print-ln').message, 'a condition must be `yes` or `no`, got an int');
  assert.equal(failure('while "s" | stop').message, 'a condition must be `yes` or `no`, got a string');
});

test('conditionals pick the first true branch and yield its value', () => {
  const source = 'proc size n\n| n > 100 ? "big"\n| : n > 10 ? "medium"\n| : "small"\n200 -> size -> print-ln\n50 -> size -> print-ln\n5 -> size -> print-ln';
  assert.equal(output(source), 'big\nmedium\nsmall\n');
  assert.equal(output('(3 > 2 ? "a" : "b") -> print-ln\n(3 < 2 ? "a") -> print-ln'), 'a\nnothing\n');
});

test('=> binds locally and rebinds within the same scope', () => {
  assert.equal(output('1 => x\n2 => x\nx -> print-ln'), '2\n');
  assert.equal(output('yes ? 1 => x : 2 => x\nx -> print-ln'), '1\n');
});

test('=> errors when it would shadow an enclosing binding, pointing at =>>', () => {
  const error = failure('0 => total\n[1 2] -> each n\n| total + n => total');
  assert.equal(error.message, '`total` already exists in an enclosing scope; use `=>> total` to update it or choose another name');
  assert.deepEqual(error.pos, { line: 3, col: 13 });
});

test('=>> updates the nearest existing binding from the current scope outward', () => {
  assert.equal(output('0 => total\n[1 2 3] -> each n\n| total + n =>> total\ntotal -> print-ln'), '6\n');
  assert.equal(output('0 => i\nwhile i < 3\n| i + 1 =>> i\ni -> print-ln'), '3\n');
  assert.equal(output('proc bump\n| 1 => local\n| local + 1 =>> local\n| local\nbump -> do -> print-ln'), '2\n');
  assert.equal(failure('1 =>> ghost').message, '`=>> ghost` found no existing binding named `ghost`');
});

test('procs read outer variables, shadow them freely with =>, and update them only with =>>', () => {
  assert.equal(output('1 => x\nproc f\n| 10 => y\n| x + y\nf -> do -> print-ln'), '11\n');
  assert.equal(output('1 => x\nproc f | 2 => x\nf -> do -> print-ln\nx -> print-ln'), '2\n1\n');
  assert.equal(output('1 => x\nproc f | 2 =>> x\nf -> do\nx -> print-ln'), '2\n');
});

test('a proc local is not affected by a caller binding the same name later', () => {
  const source = 'proc pick\n| "inner" => op\n| op\npick -> do => op\npick -> do -> print-ln\nop -> print-ln';
  assert.equal(output(source), 'inner\ninner\n');
});

test('the shadowing error applies within one activation: lambdas over proc locals and top-level names', () => {
  assert.equal(failure('proc f\n| 0 => total\n| [1] -> each n | total + n => total\nf -> do').message, '`total` already exists in an enclosing scope; use `=>> total` to update it or choose another name');
  assert.equal(output('proc f\n| 0 => total\n| [1 2] -> each n | total + n =>> total\n| total\nf -> do -> print-ln'), '3\n');
  assert.equal(output('5 => n\nproc f\n| [1] -> each n | n -> print-ln\nf -> do'), '1\n');
});

test('parameters shadow outer names without error', () => {
  assert.equal(output('5 => n\nproc f n | n * 2\n3 -> f -> print-ln\nn -> print-ln'), '6\n5\n');
});

test('a user binding may shadow a builtin', () => {
  assert.equal(output('[1 2] => print-ln-me\n7 => length\nlength -> print-ln'), '7\n');
});

test('procs return their last value and check arity', () => {
  assert.equal(output('proc add a b\n| a + b\n1 -> add 2 -> print-ln'), '3\n');
  assert.equal(output('proc noop\n| 1 => x\nnoop -> do -> print-ln'), '1\n');
  assert.equal(failure('proc add a b | a + b\n1 -> add').message, '`add` expects 2 arguments, got 1');
  assert.equal(failure('proc one a | a\n1 -> one 2 3').message, '`one` expects 1 argument, got 3');
  assert.equal(failure('1 -> 2').message.length > 0, true);
  assert.equal(failure('5 => x\n1 -> x').message, 'cannot call an int; only procedures can be called');
});

test('out exits the nearest enclosing proc, through lambdas', () => {
  const source = 'proc find-first xs target\n| xs -> each x\n| | x = target ? x -> out\n| nothing\n[1 2 3] -> find-first 2 -> print-ln\n[1 2 3] -> find-first 9 -> print-ln';
  assert.equal(output(source), '2\nnothing\n');
  assert.equal(failure('1 -> out').message, '`out` outside of a procedure');
  const escaped = failure('proc maker\n| x | x -> out\nmaker -> do => f\n1 -> f');
  assert.equal(escaped.message, '`out` was reached from a lambda whose procedure has already returned');
});

test('stop exits the innermost loop and cannot leave a proc', () => {
  assert.equal(output('0 => i\nwhile yes\n| i >= 3 ? stop\n| i + 1 =>> i\ni -> print-ln'), '3\n');
  assert.equal(output('[1 2 3 4] -> each n\n| n = 3 ? stop\n| n -> print-ln'), '1\n2\n');
  assert.equal(output('5 -> repeat i\n| i = 2 ? stop\n| i -> print-ln'), '0\n1\n');
  assert.equal(output('[1 2] -> each a\n| [10 20] -> each b\n| | b = 20 ? stop\n| | "{a}-{b}" -> print-ln'), '1-10\n2-10\n');
  assert.equal(failure('stop').message, '`stop` outside of a loop');
  assert.equal(failure('proc f | stop\n[1] -> each n | f -> do').message, '`stop` cannot leave a procedure; it only exits the loop it is written in');
});

test('lambdas are closures and procedures are values', () => {
  assert.equal(output('proc adder k\n| n | n + k\n5 -> adder => add-five\n10 -> add-five -> print-ln'), '15\n');
  assert.equal(output('proc double n | n * 2\n[double] -> each f\n| 4 -> f -> print-ln'), '8\n');
  assert.equal(output('(n | n * 3) => triple\n2 -> triple -> print-ln'), '6\n');
  assert.equal(output('proc apply x f | x -> f\n4 -> apply (n | n + 1) -> print-ln'), '5\n');
  assert.equal(output('proc inc n | n + 1\ninc -> print-ln\n(n | n) -> print-ln\nprint-ln -> print-ln'), '<proc inc>\n<lambda>\n<proc print-ln>\n');
});

test('do calls a procedure with the remaining arguments', () => {
  assert.equal(output('proc greet\n| "hi"\ngreet -> do -> print-ln'), 'hi\n');
  assert.equal(output('proc add a b | a + b\nadd -> do 1 2 -> print-ln'), '3\n');
  assert.equal(failure('1 -> do').message, 'the input of `do` must be a procedure, got an int');
});

test('interpolation formats values in print-ln form and evaluates flows', () => {
  assert.equal(output('3 => n\n"n is {n}, doubled {n * 2}, list {[1 "a"]}" -> print-ln'), 'n is 3, doubled 6, list [1 "a"]\n');
  assert.equal(output('proc twice s | s + s\n"{"ab" -> twice}!" -> print-ln'), 'abab!\n');
});

test('type-of names the type of any value', () => {
  assert.equal(output('[1 1.5 `c` yes "s" nothing [] {} print-ln] -> each v | v -> type-of -> print-ln'), 'int\nfloat\nchar\nboolean\nstring\nnothing\narray\nhashmap\nproc\n');
});

test('each, repeat and to', () => {
  assert.equal(output('1 -> to 3 -> each n | n -> print-ln'), '1\n2\n3\n');
  assert.equal(output('3 -> to 1 -> print-ln'), '[]\n');
  assert.equal(failure('1 -> to 100000000000').message, '`to` would build a value of 100000000000 elements, which is more than the limit of 50000000');
  assert.equal(output('2 -> repeat | "x" -> print-ln'), 'x\nx\n');
  assert.match(failure('1 -> each n | n').message, /^`each` cannot be used with an int; it works on array/);
  assert.equal(failure('[1] -> each').message, '`each` expects 2 arguments, got 1');
});

test('unknown names report their position', () => {
  const error = failure('1 => x\n  y -> print-ln');
  assert.equal(error.message, 'unknown name `y`');
  assert.deepEqual(error.pos, { line: 2, col: 3 });
});

test('recursion works in-process at moderate depth; the limit itself is tested through the binary', () => {
  assert.equal(output('proc count n | n = 0 ? 0 : ((n - 1) -> count) + 1\n300 -> count -> print-ln'), '300\n');
});

test('registering a builtin name twice, or both plainly and by type, is a loud error', () => {
  const interp = new Interpreter(fakeIo());
  interp.defineBuiltin('plain', 1, () => NOTHING);
  assert.throws(() => interp.defineBuiltin('plain', 1, () => NOTHING), /registered twice/);
  assert.throws(() => interp.defineMethod('plain', 'int', 1, () => NOTHING), /already a plain builtin/);
  interp.defineMethod('typed', 'int', 1, () => NOTHING);
  assert.throws(() => interp.defineBuiltin('typed', 1, () => NOTHING), /registered twice/);
  assert.throws(() => interp.defineMethod('typed', 'int', 1, () => NOTHING), /registered twice for int/);
  interp.defineMethod('typed', 'string', 1, () => NOTHING);
});

test('fail raises a program error with the given message', () => {
  const error = failure('"custom problem" -> fail');
  assert.equal(error.message, 'custom problem');
  assert.deepEqual(error.pos, { line: 1, col: 18 });
});
