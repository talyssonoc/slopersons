import { test } from 'node:test';
import assert from 'node:assert/strict';
import { failure, output } from '../helpers/run.ts';

test('char/to-int gives the code point, including outside the BMP', () => {
  assert.equal(output('`a` -> char/to-int -> io/print-line\n`👍` -> char/to-int -> io/print-line\n`\\n` -> char/to-int -> io/print-line\n`a` -> char/to-int -> type-of -> io/print-line'), '97\n128077\n10\nint\n');
  assert.equal(output('`👍` -> char/to-int -> int/to-char -> io/print-line'), '👍\n');
});

test('char/upper and char/lower map a char to a char', () => {
  assert.equal(output('`a` -> char/upper -> io/print-line\n`Z` -> char/lower -> io/print-line\n`é` -> char/upper -> io/print-line\n`1` -> char/upper -> io/print-line\n`A` -> char/upper -> io/print-line'), 'A\nz\nÉ\n1\nA\n');
  assert.equal(output('`a` -> char/upper -> type-of -> io/print-line\n`A` -> char/lower -> type-of -> io/print-line'), 'char\nchar\n');
});

test('char/upper and char/lower leave a char unchanged when its mapping is more than one code point', () => {
  assert.equal(output('`ß` -> char/upper -> io/print-line\n`İ` -> char/lower -> io/print-line\n`ß` -> char/upper -> type-of -> io/print-line'), 'ß\nİ\nchar\n');
});

test('char/is-letter, char/is-digit and char/is-space classify by Unicode category', () => {
  assert.equal(output('`a` -> char/is-letter -> io/print-line\n`é` -> char/is-letter -> io/print-line\n`1` -> char/is-letter -> io/print-line\n` ` -> char/is-letter -> io/print-line'), 'yes\nyes\nno\nno\n');
  assert.equal(output('`1` -> char/is-digit -> io/print-line\n`٣` -> char/is-digit -> io/print-line\n`a` -> char/is-digit -> io/print-line\n`½` -> char/is-digit -> io/print-line'), 'yes\nyes\nno\nno\n');
  assert.equal(output('` ` -> char/is-space -> io/print-line\n`\\t` -> char/is-space -> io/print-line\n`\\n` -> char/is-space -> io/print-line\n`a` -> char/is-space -> io/print-line'), 'yes\nyes\nyes\nno\n');
});

test('char/to-string wraps a char in a string', () => {
  assert.equal(output('`a` -> char/to-string -> show -> io/print-line\n`a` -> char/to-string -> type-of -> io/print-line\n`👍` -> char/to-string -> io/print-line'), '"a"\nstring\n👍\n');
});

test('char builtins reject other receivers and extra arguments', () => {
  assert.equal(failure('1 -> char/is-letter').message, 'the input of `char/is-letter` must be a char, got an int');
  assert.equal(failure('"a" -> char/upper').message, 'the input of `char/upper` must be a char, got a string');
  assert.equal(failure('`a` -> char/is-digit 1').message, '`char/is-digit` expects 1 argument, got 2');
});
