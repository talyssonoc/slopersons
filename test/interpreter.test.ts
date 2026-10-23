import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Interpreter } from '../src/interpreter.ts';
import { NOTHING } from '../src/values.ts';
import { failure, fakeIo, output, run, runCli } from './helpers/run.ts';

test('print writes without a newline and passes its value on', () => {
  assert.equal(output('"a" -> io/print -> io/print\n1 -> io/print\n"" -> io/print-line\n[1] -> io/print'), 'aa1\n[1]');
});

test('literals print-line in their human form', () => {
  assert.equal(output('42 -> io/print-line\n3.5 -> io/print-line\n2.0 -> io/print-line\n"hi" -> io/print-line\n`a` -> io/print-line\nyes -> io/print-line\nnothing -> io/print-line'), '42\n3.5\n2.0\nhi\na\nyes\nnothing\n');
  assert.equal(output('[1 2.5 `x` "s" yes nothing] -> io/print-line'), '[1 2.5 `x` "s" yes nothing]\n');
  assert.equal(output('{"a": 1  2: "two"} -> io/print-line'), '{"a": 1  2: "two"}\n');
  assert.equal(output('"tab\\tquote\\"" -> show -> io/print-line'), '"tab\\tquote\\""\n');
});

test('int arithmetic is arbitrary precision with floor division and floored mod', () => {
  assert.equal(output('99999999999999999999 * 99999999999999999999 -> io/print-line'), '9999999999999999999800000000000000000001\n');
  assert.equal(output('7 / 2 -> io/print-line\n-7 / 2 -> io/print-line\n7 / -2 -> io/print-line'), '3\n-4\n-4\n');
  assert.equal(output('7 mod 3 -> io/print-line\n-7 mod 3 -> io/print-line\n7 mod -3 -> io/print-line'), '1\n2\n-2\n');
  assert.equal(output('1 + 2 * 3 - 4 -> io/print-line'), '3\n');
});

test('a float operand promotes the result and floats always print-line with a point', () => {
  assert.equal(output('7.0 / 2 -> io/print-line\n1 + 0.5 -> io/print-line\n3 * 2.0 -> io/print-line\n-7.5 mod 2 -> io/print-line'), '3.5\n1.5\n6.0\n0.5\n');
});

test('division and mod by zero are errors with positions', () => {
  const error = failure('1 => x\nx / 0 -> io/print-line');
  assert.equal(error.message, 'division by zero');
  assert.deepEqual(error.position, { line: 2, col: 3 });
  assert.equal(failure('1.0 mod 0').message, '`mod` by zero');
});

test('+ concatenates strings and nothing else coerces', () => {
  assert.equal(output('"a" + "b" -> io/print-line'), 'ab\n');
  assert.equal(failure('"a" + 1').message, 'cannot add a string and an int');
  assert.equal(failure('1 - "a"').message, 'cannot subtract an int and a string');
  assert.equal(failure('-"a"').message, 'cannot negate a string');
});

test('equality is deep and structural, and different types are simply unequal', () => {
  assert.equal(output('[1 [2 "x"]] = [1 [2 "x"]] -> io/print-line'), 'yes\n');
  assert.equal(output('{"a": [1]} = {"a": [1]} -> io/print-line'), 'yes\n');
  assert.equal(output('1 = 1.0 -> io/print-line\n1 /= "1" -> io/print-line\nnothing = nothing -> io/print-line'), 'no\nyes\nyes\n');
});

test('ordering works within numbers, strings, chars, dates and arrays, and errors across types', () => {
  assert.equal(output('1 < 2.5 -> io/print-line\n"b" > "a" -> io/print-line\n`a` <= `b` -> io/print-line\n[1 2] < [1 3] -> io/print-line\n2 >= 2 -> io/print-line'), 'yes\nyes\nyes\nyes\nyes\n');
  assert.equal(output('"👍" > "z" -> io/print-line'), 'yes\n');
  assert.equal(failure('1 < "a"').message, 'cannot compare an int with a string');
  assert.equal(failure('yes < no').message, 'cannot compare a boolean with a boolean');
});

test('and/or need booleans and short-circuit', () => {
  assert.equal(output('yes and no -> io/print-line\nno or yes -> io/print-line\nnot yes -> io/print-line'), 'no\nyes\nno\n');
  assert.equal(output('no and (1 / 0 = 0) -> io/print-line\nyes or (1 / 0 = 0) -> io/print-line'), 'no\nyes\n');
  assert.equal(failure('1 and yes').message, '`and` needs booleans, got an int');
  assert.equal(failure('not 1').message, '`not` needs a boolean, got an int');
});

test('conditions must be booleans', () => {
  assert.equal(failure('1 ? "x" -> io/print-line').message, 'a condition must be `yes` or `no`, got an int');
  assert.equal(failure('while "s" | stop').message, 'a condition must be `yes` or `no`, got a string');
});

test('conditionals pick the first true branch and yield its value', () => {
  const source = 'proc size n\n| n > 100 ? "big"\n| : n > 10 ? "medium"\n| : "small"\n200 -> size -> io/print-line\n50 -> size -> io/print-line\n5 -> size -> io/print-line';
  assert.equal(output(source), 'big\nmedium\nsmall\n');
  assert.equal(output('(3 > 2 ? "a" : "b") -> io/print-line\n(3 < 2 ? "a") -> io/print-line'), 'a\nnothing\n');
});

test('=> binds locally and rebinds within the same scope', () => {
  assert.equal(output('1 => x\n2 => x\nx -> io/print-line'), '2\n');
  assert.equal(output('yes ? 1 => x : 2 => x\nx -> io/print-line'), '1\n');
});

test('=> errors when it would shadow an enclosing binding, pointing at =>>', () => {
  const error = failure('0 => total\n[1 2] -> array/each n\n| total + n => total');
  assert.equal(error.message, '`total` already exists in an enclosing scope; use `=>> total` to update it or choose another name');
  assert.deepEqual(error.position, { line: 3, col: 13 });
});

test('=>> updates the nearest existing binding from the current scope outward', () => {
  assert.equal(output('0 => total\n[1 2 3] -> array/each n\n| total + n =>> total\ntotal -> io/print-line'), '6\n');
  assert.equal(output('0 => i\nwhile i < 3\n| i + 1 =>> i\ni -> io/print-line'), '3\n');
  assert.equal(output('proc bump\n| 1 => local\n| local + 1 =>> local\n| local\nbump -> do -> io/print-line'), '2\n');
  assert.equal(failure('1 =>> ghost').message, '`=>> ghost` found no existing binding named `ghost`');
});

test('procs read outer variables, shadow them freely with =>, and update them only with =>>', () => {
  assert.equal(output('1 => x\nproc f\n| 10 => y\n| x + y\nf -> do -> io/print-line'), '11\n');
  assert.equal(output('1 => x\nproc f | 2 => x\nf -> do -> io/print-line\nx -> io/print-line'), '2\n1\n');
  assert.equal(output('1 => x\nproc f | 2 =>> x\nf -> do\nx -> io/print-line'), '2\n');
});

test('a proc local is not affected by a caller binding the same name later', () => {
  const source = 'proc pick\n| "inner" => op\n| op\npick -> do => op\npick -> do -> io/print-line\nop -> io/print-line';
  assert.equal(output(source), 'inner\ninner\n');
});

test('the shadowing error applies within one activation: lambdas over proc locals and top-level names', () => {
  assert.equal(failure('proc f\n| 0 => total\n| [1] -> array/each n | total + n => total\nf -> do').message, '`total` already exists in an enclosing scope; use `=>> total` to update it or choose another name');
  assert.equal(output('proc f\n| 0 => total\n| [1 2] -> array/each n | total + n =>> total\n| total\nf -> do -> io/print-line'), '3\n');
  assert.equal(output('5 => n\nproc f\n| [1] -> array/each n | n -> io/print-line\nf -> do'), '1\n');
});

test('parameters shadow outer names without error', () => {
  assert.equal(output('5 => n\nproc f n | n * 2\n3 -> f -> io/print-line\nn -> io/print-line'), '6\n5\n');
});

test('a user binding may shadow a builtin', () => {
  assert.equal(output('7 => show\nshow -> io/print-line\n[1] => array\narray -> io/print-line'), '7\n[1]\n');
  assert.equal(failure('7 => array\n[1] -> array/length').message, '`array` is an int, not a module, so `array/length` cannot be looked up');
});

test('procs return their last value and check arity', () => {
  assert.equal(output('proc add a b\n| a + b\n1 -> add 2 -> io/print-line'), '3\n');
  assert.equal(output('proc noop\n| 1 => x\nnoop -> do -> io/print-line'), '1\n');
  assert.equal(failure('proc add a b | a + b\n1 -> add').message, '`add` expects 2 arguments, got 1');
  assert.equal(failure('proc one a | a\n1 -> one 2 3').message, '`one` expects 1 argument, got 3');
  assert.equal(failure('1 -> 2').message.length > 0, true);
  assert.equal(failure('5 => x\n1 -> x').message, 'cannot call an int; only procedures can be called');
});

test('out exits the nearest enclosing proc, through lambdas', () => {
  const source = 'proc find-first xs target\n| xs -> array/each x\n| | x = target ? x -> out\n| nothing\n[1 2 3] -> find-first 2 -> io/print-line\n[1 2 3] -> find-first 9 -> io/print-line';
  assert.equal(output(source), '2\nnothing\n');
  assert.equal(failure('1 -> out').message, '`out` outside of a procedure');
  const escaped = failure('proc maker\n| x | x -> out\nmaker -> do => f\n1 -> f');
  assert.equal(escaped.message, '`out` was reached from a lambda whose procedure has already returned');
});

test('stop exits the innermost loop and cannot leave a proc', () => {
  assert.equal(output('0 => i\nwhile yes\n| i >= 3 ? stop\n| i + 1 =>> i\ni -> io/print-line'), '3\n');
  assert.equal(output('[1 2 3 4] -> array/each n\n| n = 3 ? stop\n| n -> io/print-line'), '1\n2\n');
  assert.equal(output('5 -> int/times i\n| i = 2 ? stop\n| i -> io/print-line'), '0\n1\n');
  assert.equal(output('[1 2] -> array/each a\n| [10 20] -> array/each b\n| | b = 20 ? stop\n| | "{a}-{b}" -> io/print-line'), '1-10\n2-10\n');
  assert.equal(failure('stop').message, '`stop` outside of a loop');
  assert.equal(failure('proc f | stop\n[1] -> array/each n | f -> do').message, '`stop` cannot leave a procedure; it only exits the loop it is written in');
});

test('lambdas are closures and procedures are values', () => {
  assert.equal(output('proc adder k\n| n | n + k\n5 -> adder => add-five\n10 -> add-five -> io/print-line'), '15\n');
  assert.equal(output('proc double n | n * 2\n[double] -> array/each f\n| 4 -> f -> io/print-line'), '8\n');
  assert.equal(output('(n | n * 3) => triple\n2 -> triple -> io/print-line'), '6\n');
  assert.equal(output('proc apply x f | x -> f\n4 -> apply (n | n + 1) -> io/print-line'), '5\n');
  assert.equal(output('proc inc n | n + 1\ninc -> io/print-line\n(n | n) -> io/print-line\nio/print-line -> io/print-line'), '<proc inc>\n<lambda>\n<proc io/print-line>\n');
});

test('do calls a procedure with the remaining arguments', () => {
  assert.equal(output('proc greet\n| "hi"\ngreet -> do -> io/print-line'), 'hi\n');
  assert.equal(output('proc add a b | a + b\nadd -> do 1 2 -> io/print-line'), '3\n');
  assert.equal(failure('1 -> do').message, 'the input of `do` must be a procedure, got an int');
});

test('interpolation formats values in print-line form and evaluates flows', () => {
  assert.equal(output('3 => n\n"n is {n}, doubled {n * 2}, list {[1 "a"]}" -> io/print-line'), 'n is 3, doubled 6, list [1 "a"]\n');
  assert.equal(output('proc twice s | s + s\n"{"ab" -> twice}!" -> io/print-line'), 'abab!\n');
});

test('type-of names the type of any value', () => {
  assert.equal(output('[1 1.5 `c` yes "s" nothing [] {} io/print-line array] -> array/each v | v -> type-of -> io/print-line'), 'int\nfloat\nchar\nboolean\nstring\nnothing\narray\nhashmap\nproc\nmodule\n');
});

test('array/each, int/times and int/up-to', () => {
  assert.equal(output('1 -> int/up-to 3 -> array/each n | n -> io/print-line'), '1\n2\n3\n');
  assert.equal(output('3 -> int/up-to 1 -> io/print-line'), '[]\n');
  assert.equal(failure('1 -> int/up-to 100000000000').message, '`int/up-to` would build a value of 100000000000 elements, which is more than the limit of 50000000');
  assert.equal(output('2 -> int/times | "x" -> io/print-line'), 'x\nx\n');
  assert.equal(failure('1 -> array/each n | n').message, 'the input of `array/each` must be an array, got an int');
  assert.equal(failure('[1] -> array/each').message, '`array/each` expects 2 arguments, got 1');
});

test('unknown names report their position', () => {
  const error = failure('1 => x\n  y -> io/print-line');
  assert.equal(error.message, 'unknown name `y`');
  assert.deepEqual(error.position, { line: 2, col: 3 });
});

test('recursion works in-process at moderate depth; the limit itself is tested through the binary', () => {
  assert.equal(output('proc count n | n = 0 ? 0 : ((n - 1) -> count) + 1\n300 -> count -> io/print-line'), '300\n');
});

test('registering a builtin name twice, or a module member twice, is a loud error', () => {
  const interpreter = new Interpreter(fakeIo());
  interpreter.defineBuiltin('plain', 1, () => NOTHING);
  assert.throws(() => interpreter.defineBuiltin('plain', 1, () => NOTHING), /registered twice/);
  assert.throws(() => interpreter.builtinModule('plain'), /registered twice/);
  interpreter.defineIn('shapes', 'area', 1, () => NOTHING);
  assert.throws(() => interpreter.defineIn('shapes', 'area', 1, () => NOTHING), /registered twice/);
  assert.throws(() => interpreter.defineBuiltin('shapes', 1, () => NOTHING), /registered twice/);
  interpreter.defineMethodIn('shapes', 'size', 'int', 1, () => NOTHING);
  assert.throws(() => interpreter.defineMethodIn('shapes', 'size', 'int', 1, () => NOTHING), /registered twice for int/);
  interpreter.defineMethodIn('shapes', 'size', 'string', 1, () => NOTHING);
});

test('fail raises a program error with the given message', () => {
  const error = failure('"custom problem" -> fail');
  assert.equal(error.message, 'custom problem');
  assert.deepEqual(error.position, { line: 1, col: 18 });
});

test('attempt runs its body, and recover handles a runtime error with the error bound', () => {
  assert.equal(output('attempt\n| 1 / 0 -> io/print-line\n| "unreachable" -> io/print-line\nrecover e\n| "caught: {e}" -> io/print-line'), 'caught: division by zero\n');
  assert.equal(output('attempt\n| 5 => n\nrecover\n| 0 => n\nn -> io/print-line'), '5\n');
  assert.equal(output('attempt\n| 1 / 0 => n\nrecover\n| 0 => n\nn -> io/print-line'), '0\n');
});

test('attempt is an expression and keeps bindings made before the failure', () => {
  assert.equal(output('(attempt | "42" -> string/to-int recover | 0) -> io/print-line\n(attempt | "x" -> string/to-int recover | 0) -> io/print-line'), '42\n0\n');
  assert.equal(output('attempt\n| 1 => before\n| 1 / 0\nrecover\n| before -> io/print-line'), '1\n');
});

test('error values expose message, line and column, and print as the message', () => {
  assert.equal(output('attempt | 1 / 0 recover e | e -> error/message -> io/print-line'), 'division by zero\n');
  const source = 'attempt\n| 1 / 0\nrecover e\n| "{e -> error/line}:{e -> error/column}" -> io/print-line\n| e -> type-of -> io/print-line\n| e -> show -> io/print-line\n| [e] -> io/print-line\n| e -> error/to-string -> io/print-line';
  assert.equal(output(source), '2:5\nerror\n<error division by zero>\n[<error division by zero>]\ndivision by zero\n');
});

test('fail with a string raises a custom error; fail with an error rethrows it unchanged', () => {
  assert.equal(output('attempt | "boom" -> fail recover e | e -> io/print-line'), 'boom\n');
  const error = failure('attempt\n| 1 / 0\nrecover e\n| e -> fail');
  assert.equal(error.message, 'division by zero');
  assert.deepEqual(error.position, { line: 2, col: 5 });
  assert.equal(failure('attempt | 1 / 0 recover e | "again: {e}" -> fail').message, 'again: division by zero');
});

test('an error raised inside recover propagates, and attempts nest', () => {
  assert.equal(failure('attempt | 1 / 0 recover | "x" -> string/to-int').message, 'cannot convert "x" to an int');
  assert.equal(output('attempt\n| attempt | 1 / 0 recover | "inner" -> fail\nrecover e\n| "outer saw {e}" -> io/print-line'), 'outer saw inner\n');
});

test('out, stop and exit pass through attempt untouched', () => {
  assert.equal(output('proc f\n| attempt | "early" -> out recover | "never"\n| "late"\nf -> do -> io/print-line'), 'early\n');
  assert.equal(output('[1 2 3] -> array/each n\n| attempt | n = 2 ? stop recover | "never" -> io/print-line\n| n -> io/print-line'), '1\n');
  const { code, io } = runCli('attempt | 3 -> exit recover | "never" -> io/print-line');
  assert.equal(code, 3);
  assert.equal(io.out, '');
});

test('the error name may reuse a name bound outside, including inside lambdas', () => {
  assert.equal(output('attempt | 1 / 0 recover e | nothing\n[1] -> array/each n\n| attempt | 1 / 0 recover e | e -> io/print-line\ne -> io/print-line'), 'division by zero\ndivision by zero\n');
});

test('always runs after the body or the handler, and the statement keeps their value', () => {
  assert.equal(output('attempt\n| "body" -> io/print-line\nalways\n| "cleanup" -> io/print-line'), 'body\ncleanup\n');
  assert.equal(output('attempt | 1 / 0 recover e | "handled {e}" -> io/print-line always | "after" -> io/print-line'), 'handled division by zero\nafter\n');
  assert.equal(output('(attempt | 5 recover | 0 always | "ignored") -> io/print-line\n(attempt | 1 / 0 recover | 0 always | "ignored") -> io/print-line'), '5\n0\n');
  assert.equal(output('attempt | 1 => n always | n + 1 => n\nn -> io/print-line'), '2\n');
});

test('always runs before an unhandled error, an out or a stop propagates, but not before exit', () => {
  const unhandled = run('attempt | 1 / 0 always | "cleanup" -> io/print-line');
  assert.equal(unhandled.out, 'cleanup\n');
  assert.equal(unhandled.error?.message, 'division by zero');
  assert.equal(output('proc f\n| attempt | "early" -> out always | "cleanup" -> io/print-line\n| "late"\nf -> do -> io/print-line'), 'cleanup\nearly\n');
  assert.equal(output('[1 2 3] -> array/each n\n| attempt | n = 2 ? stop always | "cleanup {n}" -> io/print-line\n| n -> io/print-line'), 'cleanup 1\n1\ncleanup 2\n');
  const exited = runCli('attempt | 3 -> exit always | "never" -> io/print-line');
  assert.equal(exited.code, 3);
  assert.equal(exited.io.out, '');
});

test('an error raised inside always replaces whatever was pending', () => {
  assert.equal(failure('attempt | 1 / 0 always | "worse" -> fail').message, 'worse');
  assert.equal(failure('attempt | 1 recover | 0 always | "x" -> string/to-int').message, 'cannot convert "x" to an int');
  const nested = output('attempt\n| attempt | 1 / 0 always | "inner cleanup" -> io/print-line\nrecover e\n| "outer got {e}" -> io/print-line');
  assert.equal(nested, 'inner cleanup\nouter got division by zero\n');
});
