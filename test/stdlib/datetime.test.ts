import { test } from 'node:test';
import assert from 'node:assert/strict';
import { failure, output } from '../helpers/run.ts';

const christmas = '(2024 -> date/make 12 25) -> date/at-time (18 -> time/make 30 0)';

test('date/at-time combines a date and a time into a datetime', () => {
  assert.equal(output(`${christmas} -> io/print-ln\n${christmas} -> type-of -> io/print-ln`), '2024-12-25T18:30:00\ndatetime\n');
  assert.equal(output('(2024 -> date/make 12 25) -> date/at-time (18 -> time/make 30 0 250) -> io/print-ln'), '2024-12-25T18:30:00.250\n');
  assert.equal(failure('(2024 -> date/make 12 25) -> date/at-time 5').message, 'the time of `date/at-time` must be a time, got an int');
  assert.equal(failure('5 -> date/at-time (18 -> time/make 30 0)').message, 'the input of `date/at-time` must be a date, got an int');
});

test('datetime/now is a datetime', () => {
  assert.equal(output('datetime/now -> do -> type-of -> io/print-ln'), 'datetime\n');
  assert.equal(output('datetime/now -> do => a\ndatetime/now -> do => b\na <= b -> io/print-ln'), 'yes\n');
});

test('datetime/parse reads ISO text and datetime/from-epoch reads epoch milliseconds', () => {
  assert.equal(output('"2026-10-23T15:16:00" -> datetime/parse -> io/print-ln\n"2026-10-23 15:16" -> datetime/parse -> io/print-ln\n"2026-10-23T15:16:00.5Z" -> datetime/parse -> io/print-ln'), '2026-10-23T15:16:00\n2026-10-23T15:16:00\n2026-10-23T15:16:00.500\n');
  assert.equal(output('0 -> datetime/from-epoch -> io/print-ln\n-1 -> datetime/from-epoch -> io/print-ln'), '1970-01-01T00:00:00\n1969-12-31T23:59:59.999\n');
  assert.equal(failure('"2026-10-23" -> datetime/parse').message, 'cannot convert "2026-10-23" to a datetime');
  assert.equal(failure('"2026-10-23T15:16:00+02:00" -> datetime/parse').message, 'cannot convert "2026-10-23T15:16:00+02:00" to a datetime');
  assert.equal(failure('10000000000000000 -> datetime/from-epoch').message, 'epoch milliseconds 10000000000000000 is out of range');
  assert.equal(failure('5 -> datetime/parse').message, 'the input of `datetime/parse` must be a string, got an int');
  assert.equal(failure('"2026-10-23" -> datetime/from-epoch').message, 'the input of `datetime/from-epoch` must be an int, got a string');
});

test('a datetime splits back into its date and time and exposes every component', () => {
  assert.equal(output(`${christmas} => dt\ndt -> datetime/date -> io/print-ln\ndt -> datetime/time -> io/print-ln\ndt -> datetime/start-of-day -> io/print-ln\ndt -> datetime/epoch-milliseconds -> io/print-ln`), '2024-12-25\n18:30:00\n2024-12-25T00:00:00\n1735151400000\n');
  assert.equal(output(`${christmas} => dt\n[(dt -> datetime/year) (dt -> datetime/month) (dt -> datetime/day) (dt -> datetime/hour) (dt -> datetime/minute) (dt -> datetime/second) (dt -> datetime/millisecond)] -> io/print-ln\ndt -> datetime/weekday -> io/print-ln\ndt -> datetime/weekday-number -> io/print-ln`), '[2024 12 25 18 30 0 0]\nwednesday\n3\n');
});

test('shifting a datetime crosses days, months and years', () => {
  assert.equal(output(`${christmas} -> datetime/add-hours 6 -> io/print-ln`), '2024-12-26T00:30:00\n');
  assert.equal(output(`${christmas} -> datetime/add-days 7 -> io/print-ln`), '2025-01-01T18:30:00\n');
  assert.equal(output(`${christmas} -> datetime/add-minutes -1 -> io/print-ln`), '2024-12-25T18:29:00\n');
  assert.equal(output(`${christmas} -> datetime/add-seconds 90 -> io/print-ln`), '2024-12-25T18:31:30\n');
  assert.equal(output(`${christmas} -> datetime/add-milliseconds 1 -> io/print-ln`), '2024-12-25T18:30:00.001\n');
  assert.equal(failure(`${christmas} -> datetime/add-days 100000000000000`).message, 'the resulting datetime is out of range');
  assert.equal(failure(`${christmas} -> datetime/add-hours 1.5`).message, 'the count of `datetime/add-hours` must be an int, got a float');
});

test('between measures end minus start in the requested unit, floored', () => {
  const source = `${christmas} => a\n"2024-12-27T06:00:00" -> datetime/parse => b\na -> datetime/days-between b -> io/print-ln\nb -> datetime/days-between a -> io/print-ln\na -> datetime/seconds-between b -> io/print-ln\na -> datetime/milliseconds-between b -> io/print-ln`;
  assert.equal(output(source), '1\n-2\n127800\n127800000\n');
  assert.equal(failure(`${christmas} -> datetime/days-between (2024 -> date/make 1 1)`).message, 'the end of `datetime/days-between` must be a datetime, got a date');
});

test('datetime/format mixes date and time tokens', () => {
  assert.equal(output(`${christmas} -> datetime/format "dddd, mmmm d yyyy at H:MM" -> io/print-ln`), 'Wednesday, December 25 2024 at 18:30\n');
  assert.equal(output(`${christmas} -> datetime/format "dd/mm/yy HH:MM:SS" -> io/print-ln`), '25/12/24 18:30:00\n');
  assert.equal(output(`${christmas} -> datetime/to-string -> io/print-ln`), '2024-12-25T18:30:00\n');
  assert.equal(failure(`${christmas} -> datetime/format 5`).message, 'the pattern of `datetime/format` must be a string, got an int');
});

test('datetimes compare, equal structurally, and differ from dates and times', () => {
  assert.equal(output(`${christmas} => dt\ndt = ("2024-12-25T18:30" -> datetime/parse) -> io/print-ln\ndt < ("2024-12-25T18:31" -> datetime/parse) -> io/print-ln\ndt = (2024 -> date/make 12 25) -> io/print-ln`), 'yes\nyes\nno\n');
  assert.equal(failure(`${christmas} => dt\ndt < (2024 -> date/make 12 25)`).message, 'cannot compare a datetime with a date');
  assert.equal(output(`${christmas} => dt\n{dt: "dinner"} -> hashmap/at ("2024-12-25T18:30:00" -> datetime/parse) -> io/print-ln`), 'dinner\n');
});

test('datetime builtins reject dates, and the date module keeps its own add-days', () => {
  assert.equal(failure('5 -> datetime/epoch-milliseconds').message, 'the input of `datetime/epoch-milliseconds` must be a datetime, got an int');
  assert.equal(failure('2024 -> date/make 12 25 -> datetime/add-days 7').message, 'the input of `datetime/add-days` must be a datetime, got a date');
  assert.equal(output('2024 -> date/make 12 25 -> date/add-days 7 -> io/print-ln'), '2025-01-01\n');
});
