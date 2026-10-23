import { test } from 'node:test';
import assert from 'node:assert/strict';
import { failure, output } from '../helpers/run.ts';

const OVERFLOWED = '1.0 => x\n400 -> int/times | x * 10.0 =>> x\n';

test('float/round goes half away from zero on both signs and returns an int', () => {
  assert.equal(output('2.5 -> float/round -> io/print-line\n-2.5 -> float/round -> io/print-line\n0.5 -> float/round -> io/print-line\n-0.5 -> float/round -> io/print-line'), '3\n-3\n1\n-1\n');
  assert.equal(output('2.4 -> float/round -> io/print-line\n-2.6 -> float/round -> io/print-line\n2.6 -> float/round -> io/print-line\n3.0 -> float/round -> io/print-line'), '2\n-3\n3\n3\n');
  assert.equal(output('2.5 -> float/round -> type-of -> io/print-line'), 'int\n');
});

test('float/floor and float/ceil return ints and move toward the right side on negatives', () => {
  assert.equal(output('2.7 -> float/floor -> io/print-line\n-2.3 -> float/floor -> io/print-line\n3.0 -> float/floor -> io/print-line'), '2\n-3\n3\n');
  assert.equal(output('2.1 -> float/ceil -> io/print-line\n-2.7 -> float/ceil -> io/print-line\n3.0 -> float/ceil -> io/print-line'), '3\n-2\n3\n');
  assert.equal(output('2.7 -> float/floor -> type-of -> io/print-line\n2.1 -> float/ceil -> type-of -> io/print-line'), 'int\nint\n');
});

test('float/to-int truncates toward zero', () => {
  assert.equal(output('2.9 -> float/to-int -> io/print-line\n-2.9 -> float/to-int -> io/print-line\n-0.5 -> float/to-int -> io/print-line\n2.9 -> float/to-int -> type-of -> io/print-line'), '2\n-2\n0\nint\n');
});

test('float to int conversions are exact for large whole floats', () => {
  assert.equal(output('1000000000000000000000.0 -> float/to-int -> io/print-line\n1000000000000000000000.0 -> float/round -> io/print-line'), '1000000000000000000000\n1000000000000000000000\n');
});

test('float/is-integer tells whole floats from fractional ones', () => {
  assert.equal(output('2.0 -> float/is-integer -> io/print-line\n2.5 -> float/is-integer -> io/print-line\n-0.0 -> float/is-integer -> io/print-line\n-3.0 -> float/is-integer -> io/print-line'), 'yes\nno\nyes\nyes\n');
});

test('float/to-string gives the io/print-line form of a float, keeping the decimal point', () => {
  assert.equal(output('2.0 -> float/to-string -> show -> io/print-line\n-0.5 -> float/to-string -> show -> io/print-line\n2.0 -> float/to-string -> type-of -> io/print-line'), '"2.0"\n"-0.5"\nstring\n');
});

test('float to int conversions reject a float that overflowed to infinity', () => {
  assert.equal(failure(`${OVERFLOWED}x -> float/round`).message, 'the input of `float/round` is not a finite float');
  assert.equal(failure(`${OVERFLOWED}x -> float/floor`).message, 'the input of `float/floor` is not a finite float');
  assert.equal(failure(`${OVERFLOWED}x -> float/ceil`).message, 'the input of `float/ceil` is not a finite float');
  assert.equal(failure(`${OVERFLOWED}x -> float/to-int`).message, 'the input of `float/to-int` is not a finite float');
  assert.equal(output(`${OVERFLOWED}x -> float/is-integer -> io/print-line`), 'no\n');
});

test('float builtins reject other receivers and extra arguments', () => {
  assert.equal(failure('3 -> float/round').message, 'the input of `float/round` must be a float, got an int');
  assert.equal(failure('yes -> float/floor').message, 'the input of `float/floor` must be a float, got a boolean');
  assert.equal(failure('3 -> float/is-integer').message, 'the input of `float/is-integer` must be a float, got an int');
  assert.equal(failure('2.5 -> float/ceil 1').message, '`float/ceil` expects 1 argument, got 2');
});
