import { test } from 'node:test';
import assert from 'node:assert/strict';
import { failure, output } from '../helpers/run.ts';

test('to-int gives the code point, including outside the BMP', () => {
  assert.equal(output('`a` -> to-int -> print\n`👍` -> to-int -> print\n`\\n` -> to-int -> print\n`a` -> to-int -> type-of -> print'), '97\n128077\n10\nint\n');
  assert.equal(output('`👍` -> to-int -> to-char -> print'), '👍\n');
});

test('upper and lower map a char to a char', () => {
  assert.equal(output('`a` -> upper -> print\n`Z` -> lower -> print\n`é` -> upper -> print\n`1` -> upper -> print\n`A` -> upper -> print'), 'A\nz\nÉ\n1\nA\n');
  assert.equal(output('`a` -> upper -> type-of -> print\n`A` -> lower -> type-of -> print'), 'char\nchar\n');
});

test('upper and lower leave a char unchanged when its mapping is more than one code point', () => {
  assert.equal(output('`ß` -> upper -> print\n`İ` -> lower -> print\n`ß` -> upper -> type-of -> print'), 'ß\nİ\nchar\n');
});

test('is-letter, is-digit and is-space classify by Unicode category', () => {
  assert.equal(output('`a` -> is-letter -> print\n`é` -> is-letter -> print\n`1` -> is-letter -> print\n` ` -> is-letter -> print'), 'yes\nyes\nno\nno\n');
  assert.equal(output('`1` -> is-digit -> print\n`٣` -> is-digit -> print\n`a` -> is-digit -> print\n`½` -> is-digit -> print'), 'yes\nyes\nno\nno\n');
  assert.equal(output('` ` -> is-space -> print\n`\\t` -> is-space -> print\n`\\n` -> is-space -> print\n`a` -> is-space -> print'), 'yes\nyes\nyes\nno\n');
});

test('to-string wraps a char in a string', () => {
  assert.equal(output('`a` -> to-string -> show -> print\n`a` -> to-string -> type-of -> print\n`👍` -> to-string -> print'), '"a"\nstring\n👍\n');
});

test('char-only builtins reject other receivers through dispatch', () => {
  assert.equal(failure('1 -> is-letter').message, '`is-letter` cannot be used with an int; it works on char');
  assert.equal(failure('`a` -> is-digit 1').message, '`is-digit` expects 1 argument, got 2');
});
