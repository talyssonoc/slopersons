import { test } from 'node:test';
import assert from 'node:assert/strict';
import { failure, output } from '../helpers/run.ts';

const christmas = '(2024 -> date 12 25) -> at-time (18 -> time 30 0)';

test('at-time combines a date and a time into a datetime', () => {
  assert.equal(output(`${christmas} -> print-ln\n${christmas} -> type-of -> print-ln`), '2024-12-25T18:30:00\ndatetime\n');
  assert.equal(output('(2024 -> date 12 25) -> at-time (18 -> time 30 0 250) -> print-ln'), '2024-12-25T18:30:00.250\n');
  assert.equal(failure('(2024 -> date 12 25) -> at-time 5').message, 'the time of `at-time` must be a time, got an int');
});

test('now is a datetime', () => {
  assert.equal(output('now -> do -> type-of -> print-ln'), 'datetime\n');
  assert.equal(output('now -> do => a\nnow -> do => b\na <= b -> print-ln'), 'yes\n');
});

test('to-datetime parses ISO text and epoch milliseconds', () => {
  assert.equal(output('"2026-10-23T15:16:00" -> to-datetime -> print-ln\n"2026-10-23 15:16" -> to-datetime -> print-ln\n"2026-10-23T15:16:00.5Z" -> to-datetime -> print-ln'), '2026-10-23T15:16:00\n2026-10-23T15:16:00\n2026-10-23T15:16:00.500\n');
  assert.equal(output('0 -> to-datetime -> print-ln\n-1 -> to-datetime -> print-ln'), '1970-01-01T00:00:00\n1969-12-31T23:59:59.999\n');
  assert.equal(failure('"2026-10-23" -> to-datetime').message, 'cannot convert "2026-10-23" to a datetime');
  assert.equal(failure('"2026-10-23T15:16:00+02:00" -> to-datetime').message, 'cannot convert "2026-10-23T15:16:00+02:00" to a datetime');
  assert.equal(failure('10000000000000000 -> to-datetime').message, 'epoch milliseconds 10000000000000000 is out of range');
});

test('a datetime splits back into its date and time and exposes every component', () => {
  assert.equal(output(`${christmas} => dt\ndt -> date -> print-ln\ndt -> time -> print-ln\ndt -> start-of-day -> print-ln\ndt -> epoch-milliseconds -> print-ln`), '2024-12-25\n18:30:00\n2024-12-25T00:00:00\n1735151400000\n');
  assert.equal(output(`${christmas} => dt\n[(dt -> year) (dt -> month) (dt -> day) (dt -> hour) (dt -> minute) (dt -> second) (dt -> millisecond)] -> print-ln\ndt -> weekday -> print-ln\ndt -> weekday-number -> print-ln`), '[2024 12 25 18 30 0 0]\nwednesday\n3\n');
});

test('shifting a datetime crosses days, months and years', () => {
  assert.equal(output(`${christmas} -> add-hours 6 -> print-ln`), '2024-12-26T00:30:00\n');
  assert.equal(output(`${christmas} -> add-days 7 -> print-ln`), '2025-01-01T18:30:00\n');
  assert.equal(output(`${christmas} -> add-minutes -1 -> print-ln`), '2024-12-25T18:29:00\n');
  assert.equal(output(`${christmas} -> add-seconds 90 -> print-ln`), '2024-12-25T18:31:30\n');
  assert.equal(output(`${christmas} -> add-milliseconds 1 -> print-ln`), '2024-12-25T18:30:00.001\n');
  assert.equal(failure(`${christmas} -> add-days 100000000000000`).message, 'the resulting datetime is out of range');
});

test('between measures end minus start in the requested unit, floored', () => {
  const source = `${christmas} => a\n"2024-12-27T06:00:00" -> to-datetime => b\na -> days-between b -> print-ln\nb -> days-between a -> print-ln\na -> seconds-between b -> print-ln\na -> milliseconds-between b -> print-ln`;
  assert.equal(output(source), '1\n-2\n127800\n127800000\n');
  assert.equal(failure(`${christmas} -> days-between (2024 -> date 1 1)`).message, 'the end of `days-between` must be a datetime, got a date');
});

test('format mixes date and time tokens', () => {
  assert.equal(output(`${christmas} -> format "dddd, mmmm d yyyy at H:MM" -> print-ln`), 'Wednesday, December 25 2024 at 18:30\n');
  assert.equal(output(`${christmas} -> format "dd/mm/yy HH:MM:SS" -> print-ln`), '25/12/24 18:30:00\n');
  assert.equal(output(`${christmas} -> to-string -> print-ln`), '2024-12-25T18:30:00\n');
});

test('datetimes compare, equal structurally, and differ from dates and times', () => {
  assert.equal(output(`${christmas} => dt\ndt = ("2024-12-25T18:30" -> to-datetime) -> print-ln\ndt < ("2024-12-25T18:31" -> to-datetime) -> print-ln\ndt = (2024 -> date 12 25) -> print-ln`), 'yes\nyes\nno\n');
  assert.equal(failure(`${christmas} => dt\ndt < (2024 -> date 12 25)`).message, 'cannot compare a datetime with a date');
  assert.equal(output(`${christmas} => dt\n{dt: "dinner"} -> at ("2024-12-25T18:30:00" -> to-datetime) -> print-ln`), 'dinner\n');
});

test('wrong receivers are dispatch errors and the date builtins still work on dates', () => {
  assert.match(failure('5 -> epoch-milliseconds').message, /^`epoch-milliseconds` cannot be used with an int; it works on datetime/);
  assert.equal(output('2024 -> date 12 25 -> add-days 7 -> print-ln'), '2025-01-01\n');
});
