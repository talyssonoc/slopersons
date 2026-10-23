import { test } from 'node:test';
import assert from 'node:assert/strict';
import { failure, output } from '../helpers/run.ts';

const OCT_23 = '2026 -> date/make 10 23 => d\n';

test('date/make builds a calendar date from a year receiver and month and day arguments', () => {
  assert.equal(output('2026 -> date/make 10 23 -> io/print-line'), '2026-10-23\n');
  assert.equal(output('2026 -> date/make 10 23 -> type-of -> io/print-line'), 'date\n');
  assert.equal(output('1 -> date/make 1 1 -> io/print-line'), '0001-01-01\n');
  assert.equal(output('2024 -> date/make 2 29 -> io/print-line'), '2024-02-29\n');
});

test('date/make rejects impossible dates and names the attempted components zero-padded', () => {
  assert.equal(failure('2026 -> date/make 2 30').message, '2026-02-30 is not a valid date');
  assert.equal(failure('2026 -> date/make 13 1').message, '2026-13-01 is not a valid date');
  assert.equal(failure('2026 -> date/make 1 0').message, '2026-01-00 is not a valid date');
  assert.equal(failure('2023 -> date/make 2 29').message, '2023-02-29 is not a valid date');
});

test('date/make checks the types and range of its components', () => {
  assert.equal(failure('2026 -> date/make "10" 23').message, 'the month of `date/make` must be an int, got a string');
  assert.equal(failure('2026 -> date/make 10 2.5').message, 'the day of `date/make` must be an int, got a float');
  assert.equal(failure('99999999999 -> date/make 1 1').message, 'year 99999999999 is out of range');
  assert.equal(failure('2026 -> date/make 99999999999 1').message, 'month 99999999999 is out of range');
  assert.equal(failure('"2026" -> date/make 10 23').message, 'the year of `date/make` must be an int, got a string');
  assert.equal(failure('2026 -> date/make 10').message, '`date/make` expects 3 arguments, got 2');
});

test('date/parse parses yyyy-mm-dd and rejects anything else', () => {
  assert.equal(output('"2026-10-23" -> date/parse -> io/print-line'), '2026-10-23\n');
  assert.equal(output('"2026-10-23" -> date/parse -> type-of -> io/print-line'), 'date\n');
  assert.equal(output('"2024-02-29" -> date/parse -> date/day -> io/print-line'), '29\n');
  assert.equal(failure('"2026/10/23" -> date/parse').message, 'cannot convert "2026/10/23" to a date');
  assert.equal(failure('"2026-02-30" -> date/parse').message, 'cannot convert "2026-02-30" to a date');
  assert.equal(failure('"2026-1-5" -> date/parse').message, 'cannot convert "2026-1-5" to a date');
});

test('date/year, date/month and date/day extract the components as ints', () => {
  assert.equal(output(`${OCT_23}d -> date/year -> io/print-line\nd -> date/month -> io/print-line\nd -> date/day -> io/print-line`), '2026\n10\n23\n');
  assert.equal(output('"0001-01-01" -> date/parse -> date/year -> io/print-line'), '1\n');
});

test('date/weekday and date/weekday-number start the week on Monday', () => {
  assert.equal(output('1970 -> date/make 1 1 -> date/weekday -> io/print-line'), 'thursday\n');
  assert.equal(output('2000 -> date/make 1 1 -> date/weekday -> io/print-line'), 'saturday\n');
  assert.equal(output('1970 -> date/make 1 1 -> date/weekday-number -> io/print-line'), '4\n');
  assert.equal(output('2000 -> date/make 1 1 -> date/weekday-number -> io/print-line'), '6\n');
  assert.equal(output('2026 -> date/make 10 26 -> date/weekday-number -> io/print-line\n2026 -> date/make 10 25 -> date/weekday-number -> io/print-line'), '1\n7\n');
  assert.equal(output('2026 -> date/make 10 26 -> date/weekday -> io/print-line\n2026 -> date/make 10 25 -> date/weekday -> io/print-line'), 'monday\nsunday\n');
});

test('date/month-name is the lowercase English name', () => {
  assert.equal(output(`${OCT_23}d -> date/month-name -> io/print-line`), 'october\n');
  assert.equal(output('2026 -> date/make 1 15 -> date/month-name -> io/print-line\n2026 -> date/make 12 1 -> date/month-name -> io/print-line'), 'january\ndecember\n');
});

test('date/day-of-year counts from 1 and knows leap years', () => {
  assert.equal(output(`${OCT_23}d -> date/day-of-year -> io/print-line`), '296\n');
  assert.equal(output('2026 -> date/make 1 1 -> date/day-of-year -> io/print-line'), '1\n');
  assert.equal(output('2024 -> date/make 12 31 -> date/day-of-year -> io/print-line\n2023 -> date/make 12 31 -> date/day-of-year -> io/print-line'), '366\n365\n');
});

test('date/is-leap-year works on a date and on an int year', () => {
  assert.equal(output('2024 -> date/is-leap-year -> io/print-line\n1900 -> date/is-leap-year -> io/print-line\n2000 -> date/is-leap-year -> io/print-line\n2023 -> date/is-leap-year -> io/print-line'), 'yes\nno\nyes\nno\n');
  assert.equal(output('2024 -> date/make 6 1 -> date/is-leap-year -> io/print-line\n2023 -> date/make 6 1 -> date/is-leap-year -> io/print-line'), 'yes\nno\n');
  assert.equal(failure('99999999999 -> date/is-leap-year').message, 'year 99999999999 is out of range');
  assert.equal(failure('"2024" -> date/is-leap-year').message, '`date/is-leap-year` cannot be used with a string; it works on date, int');
});

test('date/add-days moves forwards and backwards across month and year boundaries', () => {
  assert.equal(output(`${OCT_23}d -> date/add-days 10 -> io/print-line\nd -> date/add-days -23 -> io/print-line\nd -> io/print-line`), '2026-11-02\n2026-09-30\n2026-10-23\n');
  assert.equal(output('2024 -> date/make 2 28 -> date/add-days 1 -> io/print-line\n2026 -> date/make 12 31 -> date/add-days 1 -> io/print-line'), '2024-02-29\n2027-01-01\n');
  assert.equal(output('1970 -> date/make 1 1 -> date/add-days -1 -> io/print-line'), '1969-12-31\n');
  assert.equal(failure(`${OCT_23}d -> date/add-days "x"`).message, 'the count of `date/add-days` must be an int, got a string');
  assert.equal(failure(`${OCT_23}d -> date/add-days 99999999999`).message, 'day count 99999999999 is out of range');
});

test('date/add-months clamps the day to the target month and handles negative counts', () => {
  assert.equal(output('2024 -> date/make 1 31 -> date/add-months 1 -> io/print-line'), '2024-02-29\n');
  assert.equal(output('2023 -> date/make 1 31 -> date/add-months 1 -> io/print-line'), '2023-02-28\n');
  assert.equal(output('2026 -> date/make 1 15 -> date/add-months -3 -> io/print-line'), '2025-10-15\n');
  assert.equal(output('2026 -> date/make 3 31 -> date/add-months -1 -> io/print-line'), '2026-02-28\n');
  assert.equal(output(`${OCT_23}d -> date/add-months 14 -> io/print-line\nd -> date/add-months 0 -> io/print-line`), '2027-12-23\n2026-10-23\n');
});

test('date/add-years clamps February 29 in non-leap years', () => {
  assert.equal(output('2024 -> date/make 2 29 -> date/add-years 1 -> io/print-line\n2024 -> date/make 2 29 -> date/add-years 4 -> io/print-line'), '2025-02-28\n2028-02-29\n');
  assert.equal(output(`${OCT_23}d -> date/add-years -30 -> io/print-line`), '1996-10-23\n');
});

test('date/days-between is the end minus the start', () => {
  assert.equal(output('(2026 -> date/make 1 1) -> date/days-between (2026 -> date/make 12 31) -> io/print-line'), '364\n');
  assert.equal(output('(2026 -> date/make 12 31) -> date/days-between (2026 -> date/make 1 1) -> io/print-line'), '-364\n');
  assert.equal(output('(2024 -> date/make 1 1) -> date/days-between (2025 -> date/make 1 1) -> io/print-line'), '366\n');
  assert.equal(output(`${OCT_23}d -> date/days-between d -> io/print-line`), '0\n');
  assert.equal(failure(`${OCT_23}d -> date/days-between 5`).message, 'the end of `date/days-between` must be a date, got an int');
});

test('date/days-in-month, date/start-of-month and date/end-of-month follow the receiver month', () => {
  assert.equal(output('2024 -> date/make 2 10 -> date/days-in-month -> io/print-line\n2023 -> date/make 2 10 -> date/days-in-month -> io/print-line'), '29\n28\n');
  assert.equal(output('2026 -> date/make 4 10 -> date/days-in-month -> io/print-line\n2026 -> date/make 10 10 -> date/days-in-month -> io/print-line'), '30\n31\n');
  assert.equal(output(`${OCT_23}d -> date/start-of-month -> io/print-line\nd -> date/end-of-month -> io/print-line`), '2026-10-01\n2026-10-31\n');
  assert.equal(output('2024 -> date/make 2 10 -> date/end-of-month -> io/print-line\n2023 -> date/make 2 10 -> date/end-of-month -> io/print-line'), '2024-02-29\n2023-02-28\n');
  assert.equal(output('2026 -> date/make 10 1 -> date/start-of-month -> io/print-line'), '2026-10-01\n');
});

test('date/format replaces every pattern token and passes other characters through', () => {
  const source = '2026 -> date/make 10 5 => d\n';
  assert.equal(output(`${source}d -> date/format "yyyy-mm-dd" -> io/print-line`), '2026-10-05\n');
  assert.equal(output(`${source}d -> date/format "d/m/yy" -> io/print-line`), '5/10/26\n');
  assert.equal(output(`${source}d -> date/format "dddd, mmmm d" -> io/print-line`), 'Monday, October 5\n');
  assert.equal(output(`${source}d -> date/format "ddd dd mmm yyyy" -> io/print-line`), 'Mon 05 Oct 2026\n');
  assert.equal(output(`${source}d -> date/format "" -> io/print-line`), '\n');
  assert.equal(output(`${source}d -> date/format "yyyy" -> type-of -> io/print-line`), 'string\n');
  assert.equal(failure(`${source}d -> date/format 5`).message, 'the pattern of `date/format` must be a string, got an int');
});

test('date/to-string gives the yyyy-mm-dd form', () => {
  assert.equal(output(`${OCT_23}d -> date/to-string -> io/print-line\nd -> date/to-string -> type-of -> io/print-line`), '2026-10-23\nstring\n');
  assert.equal(output('1 -> date/make 2 3 -> date/to-string -> io/print-line'), '0001-02-03\n');
});

test('dates compare with the ordering and equality operators', () => {
  const source = '2026 -> date/make 1 1 => a\n2026 -> date/make 1 2 => b\n';
  assert.equal(output(`${source}a < b -> io/print-line\na > b -> io/print-line\na <= a -> io/print-line\na >= b -> io/print-line`), 'yes\nno\nyes\nno\n');
  assert.equal(output(`${source}a = (2026 -> date/make 1 1) -> io/print-line\na = b -> io/print-line\na /= b -> io/print-line`), 'yes\nno\nyes\n');
  assert.equal(output(`${source}a = ("2026-01-01" -> date/parse) -> io/print-line`), 'yes\n');
  assert.equal(failure(`${source}a < 5`).message, 'cannot compare a date with an int');
});

test('date/today is a zero-argument builtin returning a date', () => {
  assert.equal(output('date/today -> do -> type-of -> io/print-line'), 'date\n');
  assert.equal(output('date/today -> do -> date/format "yyyy-mm-dd" -> type-of -> io/print-line'), 'string\n');
  assert.equal(failure('1 -> date/today').message, '`date/today` expects 0 arguments, got 1');
});

test('date builtins name the receiver type they need on other inputs', () => {
  assert.equal(failure('"x" -> date/year').message, 'the input of `date/year` must be a date, got a string');
  assert.equal(failure('5 -> date/add-days 1').message, 'the input of `date/add-days` must be a date, got an int');
  assert.equal(failure('5 -> date/parse').message, 'the input of `date/parse` must be a string, got an int');
  assert.equal(failure('[1] -> date/days-between 1').message, 'the input of `date/days-between` must be a date, got an array');
});
