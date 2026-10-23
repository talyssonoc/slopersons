import { test } from 'node:test';
import assert from 'node:assert/strict';
import { failure, output } from '../helpers/run.ts';

test('time builds a time of day from components and prints in ISO form', () => {
  assert.equal(output('12 -> time 30 0 -> print-ln\n9 -> time 5 7 42 -> print-ln\n0 -> time 0 0 -> print-ln'), '12:30:00\n09:05:07.042\n00:00:00\n');
  assert.equal(output('12 -> time 30 0 -> type-of -> print-ln'), 'time\n');
  assert.equal(output('[(12 -> time 30 0)] -> print-ln'), '[12:30:00]\n');
});

test('time rejects components out of range with the attempted value', () => {
  assert.equal(failure('25 -> time 0 0').message, '25:00:00 is not a valid time');
  assert.equal(failure('12 -> time 60 0').message, '12:60:00 is not a valid time');
  assert.equal(failure('12 -> time 30 60').message, '12:30:60 is not a valid time');
  assert.equal(failure('12 -> time 30 30 1000').message, '12:30:30.1000 is not a valid time');
  assert.equal(failure('12 -> time "30" 0').message, 'the minute of `time` must be an int, got a string');
  assert.equal(failure('12 -> time 30').message, '`time` expects 3 to 4 arguments, got 2');
});

test('to-time parses ISO text and reports what it could not convert', () => {
  assert.equal(output('"12:30" -> to-time -> print-ln\n"12:30:15.5" -> to-time -> print-ln'), '12:30:00\n12:30:15.500\n');
  assert.equal(failure('"12h30" -> to-time').message, 'cannot convert "12h30" to a time');
  assert.equal(failure('"24:00" -> to-time').message, 'cannot convert "24:00" to a time');
});

test('accessors read each component', () => {
  assert.equal(output('9 -> time 5 7 42 => t\n[(t -> hour) (t -> minute) (t -> second) (t -> millisecond) (t -> to-milliseconds)] -> print-ln'), '[9 5 7 42 32707042]\n');
});

test('shifting a time wraps around midnight in both directions', () => {
  assert.equal(output('23 -> time 30 0 -> add-hours 2 -> print-ln'), '01:30:00\n');
  assert.equal(output('0 -> time 10 0 -> add-minutes -20 -> print-ln'), '23:50:00\n');
  assert.equal(output('23 -> time 59 59 -> add-seconds 1 -> print-ln'), '00:00:00\n');
  assert.equal(output('0 -> time 0 0 -> add-milliseconds 1500 -> print-ln'), '00:00:01.500\n');
  assert.equal(output('12 -> time 0 0 -> add-hours 48 -> print-ln'), '12:00:00\n');
  assert.equal(failure('12 -> time 0 0 -> add-hours 1.5').message, 'the count of `add-hours` must be an int, got a float');
  assert.equal(failure('12 -> time 0 0 -> add-hours 10000000000000000').message, 'hour count 10000000000000000 is out of range');
});

test('between measures end minus start, with seconds floored', () => {
  assert.equal(output('9 -> time 0 0 => a\n10 -> time 30 0 => b\na -> milliseconds-between b -> print-ln\nb -> seconds-between a -> print-ln'), '5400000\n-5400\n');
  assert.equal(output('(0 -> time 0 0) -> seconds-between (0 -> time 0 1 999) -> print-ln'), '1\n');
  assert.equal(output('(0 -> time 0 1 999) -> seconds-between (0 -> time 0 0) -> print-ln'), '-2\n');
  assert.equal(failure('(0 -> time 0 0) -> seconds-between 5').message, 'the end of `seconds-between` must be a time, got an int');
});

test('times compare, equal structurally, and work as hashmap keys', () => {
  assert.equal(output('(9 -> time 0 0) < (10 -> time 0 0) -> print-ln\n(9 -> time 0 0) = ("09:00" -> to-time) -> print-ln\n(9 -> time 0 0) = 5 -> print-ln'), 'yes\nyes\nno\n');
  assert.equal(output('{(9 -> time 0 0): "standup"} => agenda\nagenda -> at ("09:00:00" -> to-time) -> print-ln'), 'standup\n');
  assert.equal(failure('(9 -> time 0 0) < 5').message, 'cannot compare a time with an int');
});

test('format and to-string', () => {
  assert.equal(output('9 -> time 5 7 42 -> format "H:MM" -> print-ln\n9 -> time 5 7 42 -> format "HH:MM:SS.SSS" -> print-ln\n9 -> time 5 7 -> to-string -> print-ln'), '9:05\n09:05:07.042\n09:05:07\n');
  assert.equal(output('"{9 -> time 5 7}" -> print-ln'), '09:05:07\n');
});

test('wrong receivers are dispatch errors', () => {
  assert.match(failure('"x" -> hour').message, /^`hour` cannot be used with a string/);
  assert.match(failure('5 -> to-milliseconds').message, /^`to-milliseconds` cannot be used with an int; it works on time/);
});
