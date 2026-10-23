import { test } from 'node:test';
import assert from 'node:assert/strict';
import { failure, output } from '../helpers/run.ts';

test('boolean/to-string gives yes or no as a string', () => {
  assert.equal(output('yes -> boolean/to-string -> show -> io/print-line\nno -> boolean/to-string -> show -> io/print-line\nyes -> boolean/to-string -> type-of -> io/print-line'), '"yes"\n"no"\nstring\n');
});

test('boolean/to-int maps yes to 1 and no to 0', () => {
  assert.equal(output('yes -> boolean/to-int -> io/print-line\nno -> boolean/to-int -> io/print-line\nyes -> boolean/to-int -> type-of -> io/print-line'), '1\n0\nint\n');
  assert.equal(output('(3 > 2) -> boolean/to-int -> io/print-line'), '1\n');
});

test('boolean builtins reject other receivers and extra arguments', () => {
  assert.equal(failure('1 -> boolean/to-int').message, 'the input of `boolean/to-int` must be a boolean, got an int');
  assert.equal(failure('"yes" -> boolean/to-string').message, 'the input of `boolean/to-string` must be a boolean, got a string');
  assert.equal(failure('yes -> boolean/to-int 1').message, '`boolean/to-int` expects 1 argument, got 2');
  assert.equal(failure('no -> boolean/to-string "x"').message, '`boolean/to-string` expects 1 argument, got 2');
});
