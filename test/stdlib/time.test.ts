import { test } from 'node:test';
import assert from 'node:assert/strict';
import { failure, output } from '../helpers/run.ts';

test('time/make builds a time of day from components and prints in ISO form', () => {
  assert.equal(output('12 -> time/make 30 0 -> io/print-ln\n9 -> time/make 5 7 42 -> io/print-ln\n0 -> time/make 0 0 -> io/print-ln'), '12:30:00\n09:05:07.042\n00:00:00\n');
  assert.equal(output('12 -> time/make 30 0 -> type-of -> io/print-ln'), 'time\n');
  assert.equal(output('[(12 -> time/make 30 0)] -> io/print-ln'), '[12:30:00]\n');
});

test('time/make rejects components out of range with the attempted value', () => {
  assert.equal(failure('25 -> time/make 0 0').message, '25:00:00 is not a valid time');
  assert.equal(failure('12 -> time/make 60 0').message, '12:60:00 is not a valid time');
  assert.equal(failure('12 -> time/make 30 60').message, '12:30:60 is not a valid time');
  assert.equal(failure('12 -> time/make 30 30 1000').message, '12:30:30.1000 is not a valid time');
  assert.equal(failure('12 -> time/make "30" 0').message, 'the minute of `time/make` must be an int, got a string');
  assert.equal(failure('"12" -> time/make 30 0').message, 'the hour of `time/make` must be an int, got a string');
  assert.equal(failure('12 -> time/make 30').message, '`time/make` expects 3 to 4 arguments, got 2');
});

test('time/parse parses ISO text and reports what it could not convert', () => {
  assert.equal(output('"12:30" -> time/parse -> io/print-ln\n"12:30:15.5" -> time/parse -> io/print-ln'), '12:30:00\n12:30:15.500\n');
  assert.equal(failure('"12h30" -> time/parse').message, 'cannot convert "12h30" to a time');
  assert.equal(failure('"24:00" -> time/parse').message, 'cannot convert "24:00" to a time');
});

test('accessors read each component', () => {
  assert.equal(output('9 -> time/make 5 7 42 => t\n[(t -> time/hour) (t -> time/minute) (t -> time/second) (t -> time/millisecond) (t -> time/to-milliseconds)] -> io/print-ln'), '[9 5 7 42 32707042]\n');
});

test('shifting a time wraps around midnight in both directions', () => {
  assert.equal(output('23 -> time/make 30 0 -> time/add-hours 2 -> io/print-ln'), '01:30:00\n');
  assert.equal(output('0 -> time/make 10 0 -> time/add-minutes -20 -> io/print-ln'), '23:50:00\n');
  assert.equal(output('23 -> time/make 59 59 -> time/add-seconds 1 -> io/print-ln'), '00:00:00\n');
  assert.equal(output('0 -> time/make 0 0 -> time/add-milliseconds 1500 -> io/print-ln'), '00:00:01.500\n');
  assert.equal(output('12 -> time/make 0 0 -> time/add-hours 48 -> io/print-ln'), '12:00:00\n');
  assert.equal(failure('12 -> time/make 0 0 -> time/add-hours 1.5').message, 'the count of `time/add-hours` must be an int, got a float');
  assert.equal(failure('12 -> time/make 0 0 -> time/add-hours 10000000000000000').message, 'hour count 10000000000000000 is out of range');
});

test('between measures end minus start, with seconds floored', () => {
  assert.equal(output('9 -> time/make 0 0 => a\n10 -> time/make 30 0 => b\na -> time/milliseconds-between b -> io/print-ln\nb -> time/seconds-between a -> io/print-ln'), '5400000\n-5400\n');
  assert.equal(output('(0 -> time/make 0 0) -> time/seconds-between (0 -> time/make 0 1 999) -> io/print-ln'), '1\n');
  assert.equal(output('(0 -> time/make 0 1 999) -> time/seconds-between (0 -> time/make 0 0) -> io/print-ln'), '-2\n');
  assert.equal(failure('(0 -> time/make 0 0) -> time/seconds-between 5').message, 'the end of `time/seconds-between` must be a time, got an int');
});

test('times compare, equal structurally, and work as hashmap keys', () => {
  assert.equal(output('(9 -> time/make 0 0) < (10 -> time/make 0 0) -> io/print-ln\n(9 -> time/make 0 0) = ("09:00" -> time/parse) -> io/print-ln\n(9 -> time/make 0 0) = 5 -> io/print-ln'), 'yes\nyes\nno\n');
  assert.equal(output('{(9 -> time/make 0 0): "standup"} => agenda\nagenda -> hashmap/at ("09:00:00" -> time/parse) -> io/print-ln'), 'standup\n');
  assert.equal(failure('(9 -> time/make 0 0) < 5').message, 'cannot compare a time with an int');
});

test('time/format and time/to-string', () => {
  assert.equal(output('9 -> time/make 5 7 42 -> time/format "H:MM" -> io/print-ln\n9 -> time/make 5 7 42 -> time/format "HH:MM:SS.SSS" -> io/print-ln\n9 -> time/make 5 7 -> time/to-string -> io/print-ln'), '9:05\n09:05:07.042\n09:05:07\n');
  assert.equal(output('"{9 -> time/make 5 7}" -> io/print-ln'), '09:05:07\n');
  assert.equal(failure('9 -> time/make 5 7 -> time/format 5').message, 'the pattern of `time/format` must be a string, got an int');
});

test('time builtins name the receiver type they need on other inputs', () => {
  assert.equal(failure('"x" -> time/hour').message, 'the input of `time/hour` must be a time, got a string');
  assert.equal(failure('5 -> time/to-milliseconds').message, 'the input of `time/to-milliseconds` must be a time, got an int');
  assert.equal(failure('5 -> time/parse').message, 'the input of `time/parse` must be a string, got an int');
});
