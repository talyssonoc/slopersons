import { test } from 'node:test';
import assert from 'node:assert/strict';
import { failure, output } from '../helpers/run.ts';

test('math/abs returns the magnitude and keeps the type of its input', () => {
  assert.equal(output('-5 -> math/abs -> io/print-ln\n5 -> math/abs -> io/print-ln\n-2.5 -> math/abs -> io/print-ln\n0 -> math/abs -> io/print-ln'), '5\n5\n2.5\n0\n');
  assert.equal(output('-99999999999999999999 -> math/abs -> io/print-ln'), '99999999999999999999\n');
  assert.equal(failure('5 -> math/abs 1').message, '`math/abs` expects 1 argument, got 2');
});

test('math functions dispatch on the receiver and name both number types when it is neither', () => {
  assert.equal(failure('"x" -> math/abs').message, '`math/abs` cannot be used with a string; it works on int, float');
  assert.equal(failure('nothing -> math/sqrt').message, '`math/sqrt` cannot be used with a nothing; it works on int, float');
});

test('math/pow with int operands and a non-negative exponent stays an exact int', () => {
  assert.equal(output('2 -> math/pow 10 -> io/print-ln\n-2 -> math/pow 3 -> io/print-ln\n7 -> math/pow 0 -> io/print-ln\n0 -> math/pow 0 -> io/print-ln'), '1024\n-8\n1\n1\n');
  assert.equal(output('2 -> math/pow 100 -> io/print-ln'), '1267650600228229401496703205376\n');
  assert.equal(output('2 -> math/pow 10 -> type-of -> io/print-ln'), 'int\n');
});

test('math/pow gives a float with a negative int exponent or any float operand', () => {
  assert.equal(output('2 -> math/pow -1 -> io/print-ln\n2 -> math/pow -2 -> io/print-ln'), '0.5\n0.25\n');
  assert.equal(output('2.0 -> math/pow 3 -> io/print-ln\n2 -> math/pow 3.0 -> io/print-ln\n9 -> math/pow 0.5 -> io/print-ln\n1.5 -> math/pow 2.0 -> io/print-ln'), '8.0\n8.0\n3.0\n2.25\n');
});

test('math/pow errors instead of producing an infinite or undefined result', () => {
  assert.equal(failure('10.0 -> math/pow 400').message, 'the result of `math/pow` is too large for a float');
  assert.equal(failure('0 -> math/pow -1').message, '`math/pow` of zero with a negative exponent');
  assert.equal(failure('0.0 -> math/pow -2').message, '`math/pow` of zero with a negative exponent');
  assert.equal(failure('-8 -> math/pow 0.5').message, '`math/pow` of a negative number with a fractional exponent');
  assert.equal(failure('10 -> math/pow 10000000000').message, 'the result of `math/pow` is too large');
  assert.equal(failure('2 -> math/pow "x"').message, 'the exponent of `math/pow` must be an int or a float, got a string');
});

test('math/sqrt always returns a float and rejects negatives before converting', () => {
  assert.equal(output('16 -> math/sqrt -> io/print-ln\n2.25 -> math/sqrt -> io/print-ln\n0 -> math/sqrt -> io/print-ln'), '4.0\n1.5\n0.0\n');
  assert.equal(failure('-4 -> math/sqrt').message, '`math/sqrt` of a negative number');
  assert.equal(failure('-0.5 -> math/sqrt').message, '`math/sqrt` of a negative number');
  assert.equal(failure('-10 -> math/pow 401 -> math/sqrt').message, '`math/sqrt` of a negative number');
  assert.equal(failure('10 -> math/pow 400 -> math/sqrt').message, 'the input of `math/sqrt` is too large for a float');
});

test('math/min and math/max return the winning operand unchanged and the input on a tie', () => {
  assert.equal(output('3 -> math/min 2.5 -> io/print-ln\n3 -> math/min 4 -> io/print-ln\n2.5 -> math/max 3 -> io/print-ln\n2.5 -> math/max 2 -> io/print-ln'), '2.5\n3\n3\n2.5\n');
  assert.equal(output('1.0 -> math/max 1 -> io/print-ln\n1 -> math/min 1.0 -> io/print-ln'), '1.0\n1\n');
  assert.equal(failure('3 -> math/min "a"').message, 'the other value of `math/min` must be an int or a float, got a string');
  assert.equal(failure('3 -> math/max nothing').message, 'the other value of `math/max` must be an int or a float, got a nothing');
});

test('math/min and math/max compare an int with a float exactly beyond 2^53', () => {
  assert.equal(output('9007199254740993 -> math/min 9007199254740992.0 -> io/print-ln'), '9007199254740992.0\n');
  assert.equal(output('9007199254740993 -> math/max 9007199254740992.0 -> io/print-ln'), '9007199254740993\n');
});

test('math/clamp returns the bound that applies, mixing ints and floats', () => {
  assert.equal(output('5 -> math/clamp 1 3 -> io/print-ln\n-5 -> math/clamp 1 3 -> io/print-ln\n2 -> math/clamp 1 3 -> io/print-ln'), '3\n1\n2\n');
  assert.equal(output('2 -> math/clamp 2.5 4 -> io/print-ln\n7.5 -> math/clamp 0 7 -> io/print-ln\n3 -> math/clamp 3 3 -> io/print-ln'), '2.5\n7\n3\n');
  assert.equal(failure('2 -> math/clamp 3 1').message, 'the low bound of `math/clamp` must not be greater than the high bound, got 3 and 1');
  assert.equal(failure('2 -> math/clamp 1 "x"').message, 'the high bound of `math/clamp` must be an int or a float, got a string');
});

test('int/is-even and int/is-odd handle negatives and only work on ints', () => {
  assert.equal(output('4 -> int/is-even -> io/print-ln\n-3 -> int/is-even -> io/print-ln\n-3 -> int/is-odd -> io/print-ln\n0 -> int/is-odd -> io/print-ln\n0 -> int/is-even -> io/print-ln'), 'yes\nno\nyes\nno\nyes\n');
  assert.equal(failure('"x" -> int/is-even').message, 'the input of `int/is-even` must be an int, got a string');
  assert.equal(failure('2.0 -> int/is-odd').message, 'the input of `int/is-odd` must be an int, got a float');
});

test('int/to-float converts an int and rejects one beyond the float range', () => {
  assert.equal(output('3 -> int/to-float -> io/print-ln\n-3 -> int/to-float -> io/print-ln\n3 -> int/to-float -> type-of -> io/print-ln'), '3.0\n-3.0\nfloat\n');
  assert.equal(failure('10 -> math/pow 400 -> int/to-float').message, 'the input of `int/to-float` is too large for a float');
});

test('int/to-int on an int is the identity', () => {
  assert.equal(output('42 -> int/to-int -> io/print-ln\n-7 -> int/to-int -> type-of -> io/print-ln'), '42\nint\n');
  assert.equal(failure('2.5 -> int/to-int').message, 'the input of `int/to-int` must be an int, got a float');
});

test('int/to-char maps a code point to a char, including outside the BMP', () => {
  assert.equal(output('97 -> int/to-char -> io/print-ln\n128077 -> int/to-char -> io/print-ln\n10 -> int/to-char -> show -> io/print-ln'), 'a\n👍\n`\\n`\n');
  assert.equal(output('97 -> int/to-char -> type-of -> io/print-ln\n1114111 -> int/to-char -> char/to-int -> io/print-ln\n57344 -> int/to-char -> char/to-int -> io/print-ln'), 'char\n1114111\n57344\n');
});

test('int/to-char rejects code points outside the range and surrogates', () => {
  assert.equal(failure('-1 -> int/to-char').message, 'the input of `int/to-char` must be a code point between 0 and 1114111, got -1');
  assert.equal(failure('1114112 -> int/to-char').message, 'the input of `int/to-char` must be a code point between 0 and 1114111, got 1114112');
  assert.equal(failure('55296 -> int/to-char').message, 'the input of `int/to-char` must not be a surrogate code point (55296 to 57343), got 55296');
  assert.equal(failure('57343 -> int/to-char').message, 'the input of `int/to-char` must not be a surrogate code point (55296 to 57343), got 57343');
});

test('int/to-string gives the io/print-ln form of an int', () => {
  assert.equal(output('42 -> int/to-string -> show -> io/print-ln\n-7 -> int/to-string -> type-of -> io/print-ln'), '"42"\nstring\n');
});

test('math/sign is an int -1, 0 or 1 for ints and floats', () => {
  assert.equal(output('-7 -> math/sign -> io/print-ln\n0 -> math/sign -> io/print-ln\n7 -> math/sign -> io/print-ln'), '-1\n0\n1\n');
  assert.equal(output('-0.5 -> math/sign -> io/print-ln\n0.0 -> math/sign -> io/print-ln\n3.5 -> math/sign -> io/print-ln\n3.5 -> math/sign -> type-of -> io/print-ln'), '-1\n0\n1\nint\n');
});
