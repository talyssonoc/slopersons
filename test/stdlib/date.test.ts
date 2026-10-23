import { test } from 'node:test';
import assert from 'node:assert/strict';
import { failure, output } from '../helpers/run.ts';

const OCT_23 = '2026 -> date 10 23 => d\n';

test('date builds a calendar date from a year receiver and month and day arguments', () => {
  assert.equal(output('2026 -> date 10 23 -> print-ln'), '2026-10-23\n');
  assert.equal(output('2026 -> date 10 23 -> type-of -> print-ln'), 'date\n');
  assert.equal(output('1 -> date 1 1 -> print-ln'), '0001-01-01\n');
  assert.equal(output('2024 -> date 2 29 -> print-ln'), '2024-02-29\n');
});

test('date rejects impossible dates and names the attempted components zero-padded', () => {
  assert.equal(failure('2026 -> date 2 30').message, '2026-02-30 is not a valid date');
  assert.equal(failure('2026 -> date 13 1').message, '2026-13-01 is not a valid date');
  assert.equal(failure('2026 -> date 1 0').message, '2026-01-00 is not a valid date');
  assert.equal(failure('2023 -> date 2 29').message, '2023-02-29 is not a valid date');
});

test('date checks the types and range of its components', () => {
  assert.equal(failure('2026 -> date "10" 23').message, 'the month of `date` must be an int, got a string');
  assert.equal(failure('2026 -> date 10 2.5').message, 'the day of `date` must be an int, got a float');
  assert.equal(failure('99999999999 -> date 1 1').message, 'year 99999999999 is out of range');
  assert.equal(failure('2026 -> date 99999999999 1').message, 'month 99999999999 is out of range');
  assert.match(failure('"2026" -> date 10 23').message, /^`date` cannot be used with a string/);
  assert.equal(failure('2026 -> date 10').message, '`date` expects 3 arguments, got 2');
});

test('to-date parses yyyy-mm-dd and rejects anything else', () => {
  assert.equal(output('"2026-10-23" -> to-date -> print-ln'), '2026-10-23\n');
  assert.equal(output('"2026-10-23" -> to-date -> type-of -> print-ln'), 'date\n');
  assert.equal(output('"2024-02-29" -> to-date -> day -> print-ln'), '29\n');
  assert.equal(failure('"2026/10/23" -> to-date').message, 'cannot convert "2026/10/23" to a date');
  assert.equal(failure('"2026-02-30" -> to-date').message, 'cannot convert "2026-02-30" to a date');
  assert.equal(failure('"2026-1-5" -> to-date').message, 'cannot convert "2026-1-5" to a date');
});

test('year, month and day extract the components as ints', () => {
  assert.equal(output(`${OCT_23}d -> year -> print-ln\nd -> month -> print-ln\nd -> day -> print-ln`), '2026\n10\n23\n');
  assert.equal(output('"0001-01-01" -> to-date -> year -> print-ln'), '1\n');
});

test('weekday and weekday-number start the week on Monday', () => {
  assert.equal(output('1970 -> date 1 1 -> weekday -> print-ln'), 'thursday\n');
  assert.equal(output('2000 -> date 1 1 -> weekday -> print-ln'), 'saturday\n');
  assert.equal(output('1970 -> date 1 1 -> weekday-number -> print-ln'), '4\n');
  assert.equal(output('2000 -> date 1 1 -> weekday-number -> print-ln'), '6\n');
  assert.equal(output('2026 -> date 10 26 -> weekday-number -> print-ln\n2026 -> date 10 25 -> weekday-number -> print-ln'), '1\n7\n');
  assert.equal(output('2026 -> date 10 26 -> weekday -> print-ln\n2026 -> date 10 25 -> weekday -> print-ln'), 'monday\nsunday\n');
});

test('month-name is the lowercase English name', () => {
  assert.equal(output(`${OCT_23}d -> month-name -> print-ln`), 'october\n');
  assert.equal(output('2026 -> date 1 15 -> month-name -> print-ln\n2026 -> date 12 1 -> month-name -> print-ln'), 'january\ndecember\n');
});

test('day-of-year counts from 1 and knows leap years', () => {
  assert.equal(output(`${OCT_23}d -> day-of-year -> print-ln`), '296\n');
  assert.equal(output('2026 -> date 1 1 -> day-of-year -> print-ln'), '1\n');
  assert.equal(output('2024 -> date 12 31 -> day-of-year -> print-ln\n2023 -> date 12 31 -> day-of-year -> print-ln'), '366\n365\n');
});

test('is-leap-year works on a date and on an int year', () => {
  assert.equal(output('2024 -> is-leap-year -> print-ln\n1900 -> is-leap-year -> print-ln\n2000 -> is-leap-year -> print-ln\n2023 -> is-leap-year -> print-ln'), 'yes\nno\nyes\nno\n');
  assert.equal(output('2024 -> date 6 1 -> is-leap-year -> print-ln\n2023 -> date 6 1 -> is-leap-year -> print-ln'), 'yes\nno\n');
  assert.equal(failure('99999999999 -> is-leap-year').message, 'year 99999999999 is out of range');
  assert.match(failure('"2024" -> is-leap-year').message, /^`is-leap-year` cannot be used with a string/);
});

test('add-days moves forwards and backwards across month and year boundaries', () => {
  assert.equal(output(`${OCT_23}d -> add-days 10 -> print-ln\nd -> add-days -23 -> print-ln\nd -> print-ln`), '2026-11-02\n2026-09-30\n2026-10-23\n');
  assert.equal(output('2024 -> date 2 28 -> add-days 1 -> print-ln\n2026 -> date 12 31 -> add-days 1 -> print-ln'), '2024-02-29\n2027-01-01\n');
  assert.equal(output('1970 -> date 1 1 -> add-days -1 -> print-ln'), '1969-12-31\n');
  assert.equal(failure(`${OCT_23}d -> add-days "x"`).message, 'the count of `add-days` must be an int, got a string');
  assert.equal(failure(`${OCT_23}d -> add-days 99999999999`).message, 'day count 99999999999 is out of range');
});

test('add-months clamps the day to the target month and handles negative counts', () => {
  assert.equal(output('2024 -> date 1 31 -> add-months 1 -> print-ln'), '2024-02-29\n');
  assert.equal(output('2023 -> date 1 31 -> add-months 1 -> print-ln'), '2023-02-28\n');
  assert.equal(output('2026 -> date 1 15 -> add-months -3 -> print-ln'), '2025-10-15\n');
  assert.equal(output('2026 -> date 3 31 -> add-months -1 -> print-ln'), '2026-02-28\n');
  assert.equal(output(`${OCT_23}d -> add-months 14 -> print-ln\nd -> add-months 0 -> print-ln`), '2027-12-23\n2026-10-23\n');
});

test('add-years clamps February 29 in non-leap years', () => {
  assert.equal(output('2024 -> date 2 29 -> add-years 1 -> print-ln\n2024 -> date 2 29 -> add-years 4 -> print-ln'), '2025-02-28\n2028-02-29\n');
  assert.equal(output(`${OCT_23}d -> add-years -30 -> print-ln`), '1996-10-23\n');
});

test('days-between is the end minus the start', () => {
  assert.equal(output('(2026 -> date 1 1) -> days-between (2026 -> date 12 31) -> print-ln'), '364\n');
  assert.equal(output('(2026 -> date 12 31) -> days-between (2026 -> date 1 1) -> print-ln'), '-364\n');
  assert.equal(output('(2024 -> date 1 1) -> days-between (2025 -> date 1 1) -> print-ln'), '366\n');
  assert.equal(output(`${OCT_23}d -> days-between d -> print-ln`), '0\n');
  assert.equal(failure(`${OCT_23}d -> days-between 5`).message, 'the end of `days-between` must be a date, got an int');
});

test('days-in-month, start-of-month and end-of-month follow the receiver month', () => {
  assert.equal(output('2024 -> date 2 10 -> days-in-month -> print-ln\n2023 -> date 2 10 -> days-in-month -> print-ln'), '29\n28\n');
  assert.equal(output('2026 -> date 4 10 -> days-in-month -> print-ln\n2026 -> date 10 10 -> days-in-month -> print-ln'), '30\n31\n');
  assert.equal(output(`${OCT_23}d -> start-of-month -> print-ln\nd -> end-of-month -> print-ln`), '2026-10-01\n2026-10-31\n');
  assert.equal(output('2024 -> date 2 10 -> end-of-month -> print-ln\n2023 -> date 2 10 -> end-of-month -> print-ln'), '2024-02-29\n2023-02-28\n');
  assert.equal(output('2026 -> date 10 1 -> start-of-month -> print-ln'), '2026-10-01\n');
});

test('format replaces every pattern token and passes other characters through', () => {
  const source = '2026 -> date 10 5 => d\n';
  assert.equal(output(`${source}d -> format "yyyy-mm-dd" -> print-ln`), '2026-10-05\n');
  assert.equal(output(`${source}d -> format "d/m/yy" -> print-ln`), '5/10/26\n');
  assert.equal(output(`${source}d -> format "dddd, mmmm d" -> print-ln`), 'Monday, October 5\n');
  assert.equal(output(`${source}d -> format "ddd dd mmm yyyy" -> print-ln`), 'Mon 05 Oct 2026\n');
  assert.equal(output(`${source}d -> format "" -> print-ln`), '\n');
  assert.equal(output(`${source}d -> format "yyyy" -> type-of -> print-ln`), 'string\n');
  assert.equal(failure(`${source}d -> format 5`).message, 'the pattern of `format` must be a string, got an int');
});

test('to-string gives the yyyy-mm-dd form', () => {
  assert.equal(output(`${OCT_23}d -> to-string -> print-ln\nd -> to-string -> type-of -> print-ln`), '2026-10-23\nstring\n');
  assert.equal(output('1 -> date 2 3 -> to-string -> print-ln'), '0001-02-03\n');
});

test('dates compare with the ordering and equality operators', () => {
  const source = '2026 -> date 1 1 => a\n2026 -> date 1 2 => b\n';
  assert.equal(output(`${source}a < b -> print-ln\na > b -> print-ln\na <= a -> print-ln\na >= b -> print-ln`), 'yes\nno\nyes\nno\n');
  assert.equal(output(`${source}a = (2026 -> date 1 1) -> print-ln\na = b -> print-ln\na /= b -> print-ln`), 'yes\nno\nyes\n');
  assert.equal(output(`${source}a = ("2026-01-01" -> to-date) -> print-ln`), 'yes\n');
  assert.equal(failure(`${source}a < 5`).message, 'cannot compare a date with an int');
});

test('today is a zero-argument builtin returning a date', () => {
  assert.equal(output('today -> do -> type-of -> print-ln'), 'date\n');
  assert.equal(output('today -> do -> format "yyyy-mm-dd" -> type-of -> print-ln'), 'string\n');
  assert.equal(failure('1 -> today').message, '`today` expects 0 arguments, got 1');
});

test('date builtins report a dispatch error on other receivers', () => {
  assert.match(failure('"x" -> year').message, /^`year` cannot be used with a string/);
  assert.match(failure('5 -> add-days 1').message, /^`add-days` cannot be used with an int/);
  assert.match(failure('5 -> to-date').message, /^`to-date` cannot be used with an int/);
  assert.match(failure('[1] -> days-between 1').message, /^`days-between` cannot be used with an array/);
});
