import { test } from 'node:test';
import assert from 'node:assert/strict';
import { failure, output } from '../helpers/run.ts';

test('to-string gives yes or no as a string', () => {
  assert.equal(output('yes -> to-string -> show -> print-ln\nno -> to-string -> show -> print-ln\nyes -> to-string -> type-of -> print-ln'), '"yes"\n"no"\nstring\n');
});

test('to-int maps yes to 1 and no to 0', () => {
  assert.equal(output('yes -> to-int -> print-ln\nno -> to-int -> print-ln\nyes -> to-int -> type-of -> print-ln'), '1\n0\nint\n');
  assert.equal(output('(3 > 2) -> to-int -> print-ln'), '1\n');
});

test('boolean builtins take exactly the piped value', () => {
  assert.equal(failure('yes -> to-int 1').message, '`to-int` expects 1 argument, got 2');
  assert.equal(failure('no -> to-string "x"').message, '`to-string` expects 1 argument, got 2');
});
