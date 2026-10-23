import { test } from 'node:test';
import assert from 'node:assert/strict';
import { failure, output } from '../helpers/run.ts';

const OVERFLOWED = '1.0 => x\n400 -> repeat | x * 10.0 =>> x\n';

test('round goes half away from zero on both signs and returns an int', () => {
  assert.equal(output('2.5 -> round -> print-ln\n-2.5 -> round -> print-ln\n0.5 -> round -> print-ln\n-0.5 -> round -> print-ln'), '3\n-3\n1\n-1\n');
  assert.equal(output('2.4 -> round -> print-ln\n-2.6 -> round -> print-ln\n2.6 -> round -> print-ln\n3.0 -> round -> print-ln'), '2\n-3\n3\n3\n');
  assert.equal(output('2.5 -> round -> type-of -> print-ln'), 'int\n');
});

test('floor and ceil return ints and move toward the right side on negatives', () => {
  assert.equal(output('2.7 -> floor -> print-ln\n-2.3 -> floor -> print-ln\n3.0 -> floor -> print-ln'), '2\n-3\n3\n');
  assert.equal(output('2.1 -> ceil -> print-ln\n-2.7 -> ceil -> print-ln\n3.0 -> ceil -> print-ln'), '3\n-2\n3\n');
  assert.equal(output('2.7 -> floor -> type-of -> print-ln\n2.1 -> ceil -> type-of -> print-ln'), 'int\nint\n');
});

test('to-int on a float truncates toward zero', () => {
  assert.equal(output('2.9 -> to-int -> print-ln\n-2.9 -> to-int -> print-ln\n-0.5 -> to-int -> print-ln\n2.9 -> to-int -> type-of -> print-ln'), '2\n-2\n0\nint\n');
});

test('float to int conversions are exact for large whole floats', () => {
  assert.equal(output('1000000000000000000000.0 -> to-int -> print-ln\n1000000000000000000000.0 -> round -> print-ln'), '1000000000000000000000\n1000000000000000000000\n');
});

test('is-integer tells whole floats from fractional ones', () => {
  assert.equal(output('2.0 -> is-integer -> print-ln\n2.5 -> is-integer -> print-ln\n-0.0 -> is-integer -> print-ln\n-3.0 -> is-integer -> print-ln'), 'yes\nno\nyes\nyes\n');
});

test('float to int conversions reject a float that overflowed to infinity', () => {
  assert.equal(failure(`${OVERFLOWED}x -> round`).message, 'the input of `round` is not a finite float');
  assert.equal(failure(`${OVERFLOWED}x -> floor`).message, 'the input of `floor` is not a finite float');
  assert.equal(failure(`${OVERFLOWED}x -> ceil`).message, 'the input of `ceil` is not a finite float');
  assert.equal(failure(`${OVERFLOWED}x -> to-int`).message, 'the input of `to-int` is not a finite float');
  assert.equal(output(`${OVERFLOWED}x -> is-integer -> print-ln`), 'no\n');
});

test('float-only builtins reject other receivers through dispatch', () => {
  assert.equal(failure('3 -> round').message, '`round` cannot be used with an int; it works on float');
  assert.equal(failure('yes -> floor').message, '`floor` cannot be used with a boolean; it works on float');
  assert.equal(failure('2.5 -> ceil 1').message, '`ceil` expects 1 argument, got 2');
});
