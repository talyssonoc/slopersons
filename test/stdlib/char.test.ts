import { test } from 'node:test';
import assert from 'node:assert/strict';
import { failure, output } from '../helpers/run.ts';

test('to-int gives the code point, including outside the BMP', () => {
  assert.equal(output('`a` -> to-int -> print-ln\n`👍` -> to-int -> print-ln\n`\\n` -> to-int -> print-ln\n`a` -> to-int -> type-of -> print-ln'), '97\n128077\n10\nint\n');
  assert.equal(output('`👍` -> to-int -> to-char -> print-ln'), '👍\n');
});

test('upper and lower map a char to a char', () => {
  assert.equal(output('`a` -> upper -> print-ln\n`Z` -> lower -> print-ln\n`é` -> upper -> print-ln\n`1` -> upper -> print-ln\n`A` -> upper -> print-ln'), 'A\nz\nÉ\n1\nA\n');
  assert.equal(output('`a` -> upper -> type-of -> print-ln\n`A` -> lower -> type-of -> print-ln'), 'char\nchar\n');
});

test('upper and lower leave a char unchanged when its mapping is more than one code point', () => {
  assert.equal(output('`ß` -> upper -> print-ln\n`İ` -> lower -> print-ln\n`ß` -> upper -> type-of -> print-ln'), 'ß\nİ\nchar\n');
});

test('is-letter, is-digit and is-space classify by Unicode category', () => {
  assert.equal(output('`a` -> is-letter -> print-ln\n`é` -> is-letter -> print-ln\n`1` -> is-letter -> print-ln\n` ` -> is-letter -> print-ln'), 'yes\nyes\nno\nno\n');
  assert.equal(output('`1` -> is-digit -> print-ln\n`٣` -> is-digit -> print-ln\n`a` -> is-digit -> print-ln\n`½` -> is-digit -> print-ln'), 'yes\nyes\nno\nno\n');
  assert.equal(output('` ` -> is-space -> print-ln\n`\\t` -> is-space -> print-ln\n`\\n` -> is-space -> print-ln\n`a` -> is-space -> print-ln'), 'yes\nyes\nyes\nno\n');
});

test('to-string wraps a char in a string', () => {
  assert.equal(output('`a` -> to-string -> show -> print-ln\n`a` -> to-string -> type-of -> print-ln\n`👍` -> to-string -> print-ln'), '"a"\nstring\n👍\n');
});

test('char-only builtins reject other receivers through dispatch', () => {
  assert.equal(failure('1 -> is-letter').message, '`is-letter` cannot be used with an int; it works on char');
  assert.equal(failure('`a` -> is-digit 1').message, '`is-digit` expects 1 argument, got 2');
});
