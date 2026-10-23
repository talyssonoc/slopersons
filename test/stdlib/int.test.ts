import { test } from 'node:test';
import assert from 'node:assert/strict';
import { failure, output } from '../helpers/run.ts';

test('abs returns the magnitude and keeps the type of its input', () => {
  assert.equal(output('-5 -> abs -> print\n5 -> abs -> print\n-2.5 -> abs -> print\n0 -> abs -> print'), '5\n5\n2.5\n0\n');
  assert.equal(output('-99999999999999999999 -> abs -> print'), '99999999999999999999\n');
  assert.equal(failure('5 -> abs 1').message, '`abs` expects 1 argument, got 2');
});

test('pow with int operands and a non-negative exponent stays an exact int', () => {
  assert.equal(output('2 -> pow 10 -> print\n-2 -> pow 3 -> print\n7 -> pow 0 -> print\n0 -> pow 0 -> print'), '1024\n-8\n1\n1\n');
  assert.equal(output('2 -> pow 100 -> print'), '1267650600228229401496703205376\n');
  assert.equal(output('2 -> pow 10 -> type-of -> print'), 'int\n');
});

test('pow gives a float with a negative int exponent or any float operand', () => {
  assert.equal(output('2 -> pow -1 -> print\n2 -> pow -2 -> print'), '0.5\n0.25\n');
  assert.equal(output('2.0 -> pow 3 -> print\n2 -> pow 3.0 -> print\n9 -> pow 0.5 -> print\n1.5 -> pow 2.0 -> print'), '8.0\n8.0\n3.0\n2.25\n');
});

test('pow errors instead of producing an infinite or undefined result', () => {
  assert.equal(failure('10.0 -> pow 400').message, 'the result of `pow` is too large for a float');
  assert.equal(failure('0 -> pow -1').message, '`pow` of zero with a negative exponent');
  assert.equal(failure('0.0 -> pow -2').message, '`pow` of zero with a negative exponent');
  assert.equal(failure('-8 -> pow 0.5').message, '`pow` of a negative number with a fractional exponent');
  assert.equal(failure('10 -> pow 10000000000').message, 'the result of `pow` is too large');
  assert.equal(failure('2 -> pow "x"').message, 'the exponent of `pow` must be an int or a float, got a string');
});

test('sqrt always returns a float and rejects negatives before converting', () => {
  assert.equal(output('16 -> sqrt -> print\n2.25 -> sqrt -> print\n0 -> sqrt -> print'), '4.0\n1.5\n0.0\n');
  assert.equal(failure('-4 -> sqrt').message, '`sqrt` of a negative number');
  assert.equal(failure('-0.5 -> sqrt').message, '`sqrt` of a negative number');
  assert.equal(failure('-10 -> pow 401 -> sqrt').message, '`sqrt` of a negative number');
  assert.equal(failure('10 -> pow 400 -> sqrt').message, 'the input of `sqrt` is too large for a float');
});

test('min and max return the winning operand unchanged and the input on a tie', () => {
  assert.equal(output('3 -> min 2.5 -> print\n3 -> min 4 -> print\n2.5 -> max 3 -> print\n2.5 -> max 2 -> print'), '2.5\n3\n3\n2.5\n');
  assert.equal(output('1.0 -> max 1 -> print\n1 -> min 1.0 -> print'), '1.0\n1\n');
  assert.equal(failure('3 -> min "a"').message, 'the other value of `min` must be an int or a float, got a string');
  assert.equal(failure('3 -> max nothing').message, 'the other value of `max` must be an int or a float, got a nothing');
});

test('min and max compare an int with a float exactly beyond 2^53', () => {
  assert.equal(output('9007199254740993 -> min 9007199254740992.0 -> print'), '9007199254740992.0\n');
  assert.equal(output('9007199254740993 -> max 9007199254740992.0 -> print'), '9007199254740993\n');
});

test('clamp returns the bound that applies, mixing ints and floats', () => {
  assert.equal(output('5 -> clamp 1 3 -> print\n-5 -> clamp 1 3 -> print\n2 -> clamp 1 3 -> print'), '3\n1\n2\n');
  assert.equal(output('2 -> clamp 2.5 4 -> print\n7.5 -> clamp 0 7 -> print\n3 -> clamp 3 3 -> print'), '2.5\n7\n3\n');
  assert.equal(failure('2 -> clamp 3 1').message, 'the low bound of `clamp` must not be greater than the high bound, got 3 and 1');
  assert.equal(failure('2 -> clamp 1 "x"').message, 'the high bound of `clamp` must be an int or a float, got a string');
});

test('is-even and is-odd handle negatives and only work on ints', () => {
  assert.equal(output('4 -> is-even -> print\n-3 -> is-even -> print\n-3 -> is-odd -> print\n0 -> is-odd -> print\n0 -> is-even -> print'), 'yes\nno\nyes\nno\nyes\n');
  assert.equal(failure('"x" -> is-even').message, '`is-even` cannot be used with a string; it works on int');
  assert.equal(failure('2.0 -> is-odd').message, '`is-odd` cannot be used with a float; it works on int');
});

test('to-float converts an int and rejects one beyond the float range', () => {
  assert.equal(output('3 -> to-float -> print\n-3 -> to-float -> print\n3 -> to-float -> type-of -> print'), '3.0\n-3.0\nfloat\n');
  assert.equal(failure('10 -> pow 400 -> to-float').message, 'the input of `to-float` is too large for a float');
});

test('to-int on an int is the identity', () => {
  assert.equal(output('42 -> to-int -> print\n-7 -> to-int -> type-of -> print'), '42\nint\n');
});

test('to-char maps a code point to a char, including outside the BMP', () => {
  assert.equal(output('97 -> to-char -> print\n128077 -> to-char -> print\n10 -> to-char -> show -> print'), 'a\n👍\n`\\n`\n');
  assert.equal(output('97 -> to-char -> type-of -> print\n1114111 -> to-char -> to-int -> print\n57344 -> to-char -> to-int -> print'), 'char\n1114111\n57344\n');
});

test('to-char rejects code points outside the range and surrogates', () => {
  assert.equal(failure('-1 -> to-char').message, 'the input of `to-char` must be a code point between 0 and 1114111, got -1');
  assert.equal(failure('1114112 -> to-char').message, 'the input of `to-char` must be a code point between 0 and 1114111, got 1114112');
  assert.equal(failure('55296 -> to-char').message, 'the input of `to-char` must not be a surrogate code point (55296 to 57343), got 55296');
  assert.equal(failure('57343 -> to-char').message, 'the input of `to-char` must not be a surrogate code point (55296 to 57343), got 57343');
});

test('to-string gives the print form of ints and floats', () => {
  assert.equal(output('42 -> to-string -> show -> print\n2.0 -> to-string -> show -> print\n-7 -> to-string -> type-of -> print'), '"42"\n"2.0"\nstring\n');
});

test('sign is an int -1, 0 or 1 for ints and floats', () => {
  assert.equal(output('-7 -> sign -> print\n0 -> sign -> print\n7 -> sign -> print'), '-1\n0\n1\n');
  assert.equal(output('-0.5 -> sign -> print\n0.0 -> sign -> print\n3.5 -> sign -> print\n3.5 -> sign -> type-of -> print'), '-1\n0\n1\nint\n');
});
