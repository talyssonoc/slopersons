import { test } from 'node:test';
import assert from 'node:assert/strict';
import { failure, output } from '../helpers/run.ts';

test('char/to-int gives the code point, including outside the BMP', () => {
  assert.equal(output('`a` -> char/to-int -> io/print-ln\n`👍` -> char/to-int -> io/print-ln\n`\\n` -> char/to-int -> io/print-ln\n`a` -> char/to-int -> type-of -> io/print-ln'), '97\n128077\n10\nint\n');
  assert.equal(output('`👍` -> char/to-int -> int/to-char -> io/print-ln'), '👍\n');
});

test('char/upper and char/lower map a char to a char', () => {
  assert.equal(output('`a` -> char/upper -> io/print-ln\n`Z` -> char/lower -> io/print-ln\n`é` -> char/upper -> io/print-ln\n`1` -> char/upper -> io/print-ln\n`A` -> char/upper -> io/print-ln'), 'A\nz\nÉ\n1\nA\n');
  assert.equal(output('`a` -> char/upper -> type-of -> io/print-ln\n`A` -> char/lower -> type-of -> io/print-ln'), 'char\nchar\n');
});

test('char/upper and char/lower leave a char unchanged when its mapping is more than one code point', () => {
  assert.equal(output('`ß` -> char/upper -> io/print-ln\n`İ` -> char/lower -> io/print-ln\n`ß` -> char/upper -> type-of -> io/print-ln'), 'ß\nİ\nchar\n');
});

test('char/is-letter, char/is-digit and char/is-space classify by Unicode category', () => {
  assert.equal(output('`a` -> char/is-letter -> io/print-ln\n`é` -> char/is-letter -> io/print-ln\n`1` -> char/is-letter -> io/print-ln\n` ` -> char/is-letter -> io/print-ln'), 'yes\nyes\nno\nno\n');
  assert.equal(output('`1` -> char/is-digit -> io/print-ln\n`٣` -> char/is-digit -> io/print-ln\n`a` -> char/is-digit -> io/print-ln\n`½` -> char/is-digit -> io/print-ln'), 'yes\nyes\nno\nno\n');
  assert.equal(output('` ` -> char/is-space -> io/print-ln\n`\\t` -> char/is-space -> io/print-ln\n`\\n` -> char/is-space -> io/print-ln\n`a` -> char/is-space -> io/print-ln'), 'yes\nyes\nyes\nno\n');
});

test('char/to-string wraps a char in a string', () => {
  assert.equal(output('`a` -> char/to-string -> show -> io/print-ln\n`a` -> char/to-string -> type-of -> io/print-ln\n`👍` -> char/to-string -> io/print-ln'), '"a"\nstring\n👍\n');
});

test('char builtins reject other receivers and extra arguments', () => {
  assert.equal(failure('1 -> char/is-letter').message, 'the input of `char/is-letter` must be a char, got an int');
  assert.equal(failure('"a" -> char/upper').message, 'the input of `char/upper` must be a char, got a string');
  assert.equal(failure('`a` -> char/is-digit 1').message, '`char/is-digit` expects 1 argument, got 2');
});
