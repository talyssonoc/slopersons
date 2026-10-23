import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MONTH_NAMES,
  WEEKDAY_NAMES,
  addMonths,
  civilFromDays,
  dayOfYear,
  daysFromCivil,
  daysInMonth,
  formatDate,
  isLeapYear,
  isValidDate,
  parseIsoDate,
  weekday,
} from '../../src/runtime/calendar.ts';

const RANGE_DAYS = 150_000;
const MILLISECONDS_PER_DAY = 86_400_000;

test('1970-01-01 is day 0 and 1969-12-31 is day -1', () => {
  assert.equal(daysFromCivil(1970, 1, 1), 0);
  assert.equal(daysFromCivil(1969, 12, 31), -1);
  assert.deepEqual(civilFromDays(0), { year: 1970, month: 1, day: 1 });
  assert.deepEqual(civilFromDays(-1), { year: 1969, month: 12, day: 31 });
});

test('leap years follow the 4/100/400 rule, including year 0 and negative years', () => {
  assert.equal(isLeapYear(2000), true);
  assert.equal(isLeapYear(1900), false);
  assert.equal(isLeapYear(2024), true);
  assert.equal(isLeapYear(2100), false);
  assert.equal(isLeapYear(2023), false);
  assert.equal(isLeapYear(0), true);
  assert.equal(isLeapYear(-4), true);
  assert.equal(isLeapYear(-100), false);
  assert.equal(isLeapYear(-400), true);
});

test('daysInMonth gives 28/29 for February and 30/31 elsewhere', () => {
  assert.equal(daysInMonth(2024, 2), 29);
  assert.equal(daysInMonth(2025, 2), 28);
  assert.equal(daysInMonth(2025, 4), 30);
  assert.equal(daysInMonth(2025, 6), 30);
  assert.equal(daysInMonth(2025, 9), 30);
  assert.equal(daysInMonth(2025, 11), 30);
  assert.equal(daysInMonth(2025, 1), 31);
  assert.equal(daysInMonth(2025, 12), 31);
});

test('Feb 29 is valid only in leap years', () => {
  assert.equal(isValidDate(2000, 2, 29), true);
  assert.equal(isValidDate(1900, 2, 29), false);
  assert.equal(isValidDate(2024, 2, 29), true);
  assert.equal(isValidDate(2100, 2, 29), false);
});

test('isValidDate rejects bad months, bad days and non-integers but accepts any integer year', () => {
  assert.equal(isValidDate(2024, 0, 1), false);
  assert.equal(isValidDate(2024, 13, 1), false);
  assert.equal(isValidDate(2024, 4, 31), false);
  assert.equal(isValidDate(2024, 4, 30), true);
  assert.equal(isValidDate(2024, 1, 0), false);
  assert.equal(isValidDate(2024, 1, 1.5), false);
  assert.equal(isValidDate(2024.5, 1, 1), false);
  assert.equal(isValidDate(-44, 3, 15), true);
  assert.equal(isValidDate(0, 1, 1), true);
  assert.equal(isValidDate(99999, 12, 31), true);
});

test('0001-01-01 and far-future dates round-trip through known day numbers', () => {
  assert.equal(daysFromCivil(1, 1, 1), -719162);
  assert.deepEqual(civilFromDays(-719162), { year: 1, month: 1, day: 1 });
  assert.equal(daysFromCivil(275760, 9, 13), 100_000_000);
  assert.deepEqual(civilFromDays(100_000_000), { year: 275760, month: 9, day: 13 });
  assert.deepEqual(civilFromDays(daysFromCivil(9999, 12, 31)), { year: 9999, month: 12, day: 31 });
  assert.deepEqual(civilFromDays(daysFromCivil(-4712, 1, 1)), { year: -4712, month: 1, day: 1 });
});

test('weekday uses ISO numbering with Monday = 1 and Sunday = 7', () => {
  assert.equal(weekday(0), 4);
  assert.equal(weekday(-1), 3);
  assert.equal(weekday(daysFromCivil(2000, 1, 1)), 6);
  assert.equal(weekday(daysFromCivil(2000, 1, 2)), 7);
  assert.equal(weekday(daysFromCivil(2000, 1, 3)), 1);
  assert.equal(weekday(daysFromCivil(2026, 10, 23)), 5);
});

test('civilFromDays and daysFromCivil round-trip for every day in a 300000-day range', () => {
  for (let days = -RANGE_DAYS; days <= RANGE_DAYS; days++) {
    const civil = civilFromDays(days);
    if (!isValidDate(civil.year, civil.month, civil.day)) {
      assert.fail(`day ${days} produced the invalid date ${JSON.stringify(civil)}`);
    }
    const back = daysFromCivil(civil.year, civil.month, civil.day);
    if (back !== days) {
      assert.fail(`day ${days} became ${JSON.stringify(civil)} which maps back to ${back}`);
    }
  }
});

test('civilFromDays matches the JS Date oracle for every day in the range', () => {
  for (let days = -RANGE_DAYS; days <= RANGE_DAYS; days++) {
    const oracle = new Date(days * MILLISECONDS_PER_DAY);
    const expected = {
      year: oracle.getUTCFullYear(),
      month: oracle.getUTCMonth() + 1,
      day: oracle.getUTCDate(),
    };
    const actual = civilFromDays(days);
    if (actual.year !== expected.year || actual.month !== expected.month || actual.day !== expected.day) {
      assert.deepEqual(actual, expected, `day ${days}`);
    }
  }
});

test('daysFromCivil matches Date.UTC for every day in the range', () => {
  for (let days = -RANGE_DAYS; days <= RANGE_DAYS; days++) {
    const oracle = new Date(days * MILLISECONDS_PER_DAY);
    const year = oracle.getUTCFullYear();
    const month = oracle.getUTCMonth() + 1;
    const day = oracle.getUTCDate();
    const actual = daysFromCivil(year, month, day);
    if (actual !== days) {
      assert.equal(actual, days, `${year}-${month}-${day}`);
    }
  }
});

test('weekday matches the JS Date oracle for every day in the range', () => {
  for (let days = -RANGE_DAYS; days <= RANGE_DAYS; days++) {
    const utcDay = new Date(days * MILLISECONDS_PER_DAY).getUTCDay();
    const expected = utcDay === 0 ? 7 : utcDay;
    const actual = weekday(days);
    if (actual !== expected) {
      assert.equal(actual, expected, `day ${days}`);
    }
  }
});

test('dayOfYear counts from 1 and accounts for leap days', () => {
  assert.equal(dayOfYear(2025, 1, 1), 1);
  assert.equal(dayOfYear(2024, 1, 1), 1);
  assert.equal(dayOfYear(2025, 12, 31), 365);
  assert.equal(dayOfYear(2024, 12, 31), 366);
  assert.equal(dayOfYear(2024, 3, 1), 61);
  assert.equal(dayOfYear(2025, 3, 1), 60);
  assert.equal(dayOfYear(2024, 2, 29), 60);
});

test('addMonths clamps the day to the target month length', () => {
  assert.deepEqual(addMonths(2025, 1, 31, 1), { year: 2025, month: 2, day: 28 });
  assert.deepEqual(addMonths(2024, 1, 31, 1), { year: 2024, month: 2, day: 29 });
  assert.deepEqual(addMonths(2025, 3, 31, -1), { year: 2025, month: 2, day: 28 });
  assert.deepEqual(addMonths(2024, 3, 31, -1), { year: 2024, month: 2, day: 29 });
  assert.deepEqual(addMonths(2025, 5, 31, 1), { year: 2025, month: 6, day: 30 });
  assert.deepEqual(addMonths(2025, 1, 15, 1), { year: 2025, month: 2, day: 15 });
});

test('addMonths crosses year boundaries in both directions', () => {
  assert.deepEqual(addMonths(2024, 12, 15, 1), { year: 2025, month: 1, day: 15 });
  assert.deepEqual(addMonths(2025, 1, 15, -1), { year: 2024, month: 12, day: 15 });
  assert.deepEqual(addMonths(2024, 11, 30, 3), { year: 2025, month: 2, day: 28 });
  assert.deepEqual(addMonths(2025, 3, 31, -25), { year: 2023, month: 2, day: 28 });
  assert.deepEqual(addMonths(2025, 6, 15, 0), { year: 2025, month: 6, day: 15 });
});

test('addMonths by +12 and -12 moves exactly one year, clamping Feb 29', () => {
  assert.deepEqual(addMonths(2025, 6, 30, 12), { year: 2026, month: 6, day: 30 });
  assert.deepEqual(addMonths(2025, 6, 30, -12), { year: 2024, month: 6, day: 30 });
  assert.deepEqual(addMonths(2024, 2, 29, 12), { year: 2025, month: 2, day: 28 });
  assert.deepEqual(addMonths(2024, 2, 29, -12), { year: 2023, month: 2, day: 28 });
  assert.deepEqual(addMonths(2024, 2, 29, 48), { year: 2028, month: 2, day: 29 });
});

test('parseIsoDate accepts strict yyyy-mm-dd', () => {
  assert.deepEqual(parseIsoDate('2024-02-29'), { year: 2024, month: 2, day: 29 });
  assert.deepEqual(parseIsoDate('1970-01-01'), { year: 1970, month: 1, day: 1 });
  assert.deepEqual(parseIsoDate('0001-01-01'), { year: 1, month: 1, day: 1 });
  assert.deepEqual(parseIsoDate('9999-12-31'), { year: 9999, month: 12, day: 31 });
});

test('parseIsoDate rejects the wrong length', () => {
  assert.equal(parseIsoDate(''), null);
  assert.equal(parseIsoDate('2024-2-29'), null);
  assert.equal(parseIsoDate('2024-02-9'), null);
  assert.equal(parseIsoDate('2024-02-291'), null);
  assert.equal(parseIsoDate('12024-02-29'), null);
});

test('parseIsoDate rejects non-ASCII-digit characters and wrong separators', () => {
  assert.equal(parseIsoDate('2O24-02-29'), null);
  assert.equal(parseIsoDate('2024-02-2a'), null);
  assert.equal(parseIsoDate('2024/02/29'), null);
  assert.equal(parseIsoDate('2024-02_29'), null);
  assert.equal(parseIsoDate('+024-02-29'), null);
  assert.equal(parseIsoDate('２０２４-02-29'), null);
});

test('parseIsoDate rejects dates that do not exist', () => {
  assert.equal(parseIsoDate('2024-13-01'), null);
  assert.equal(parseIsoDate('2024-00-01'), null);
  assert.equal(parseIsoDate('2024-01-00'), null);
  assert.equal(parseIsoDate('2024-02-30'), null);
  assert.equal(parseIsoDate('2025-02-29'), null);
  assert.equal(parseIsoDate('2024-04-31'), null);
});

test('parseIsoDate rejects leading or trailing whitespace', () => {
  assert.equal(parseIsoDate(' 2024-02-29'), null);
  assert.equal(parseIsoDate('2024-02-29 '), null);
  assert.equal(parseIsoDate(' 2024-02-2'), null);
  assert.equal(parseIsoDate('2024-02-29\n'), null);
});

test('formatDate renders the numeric tokens', () => {
  assert.equal(formatDate({ year: 2000, month: 1, day: 1 }, 'yyyy-mm-dd'), '2000-01-01');
  assert.equal(formatDate({ year: 2025, month: 10, day: 23 }, 'yyyy-mm-dd'), '2025-10-23');
  assert.equal(formatDate({ year: 2025, month: 10, day: 23 }, 'd/m/yyyy'), '23/10/2025');
  assert.equal(formatDate({ year: 2025, month: 3, day: 7 }, 'd/m/yyyy'), '7/3/2025');
  assert.equal(formatDate({ year: 2025, month: 3, day: 7 }, 'dd/mm/yy'), '07/03/25');
});

test('formatDate renders weekday and month names', () => {
  assert.equal(formatDate({ year: 2000, month: 1, day: 1 }, 'dddd, mmmm d yyyy'), 'Saturday, January 1 2000');
  assert.equal(formatDate({ year: 2000, month: 1, day: 1 }, 'ddd mmm dd yy'), 'Sat Jan 01 00');
  assert.equal(formatDate({ year: 2025, month: 12, day: 31 }, 'ddd mmm dd yy'), 'Wed Dec 31 25');
  assert.equal(formatDate({ year: 2024, month: 9, day: 15 }, 'dddd d mmmm'), 'Sunday 15 September');
});

test('formatDate copies characters that are not tokens, including a lone y', () => {
  assert.equal(formatDate({ year: 2000, month: 1, day: 1 }, 'Day: d of mmmm (yyyy)'), 'Day: 1 of January (2000)');
  assert.equal(formatDate({ year: 2000, month: 1, day: 1 }, 'yyyyy'), '2000y');
  assert.equal(formatDate({ year: 2000, month: 1, day: 1 }, 'MM DD YYYY'), 'MM DD YYYY');
  assert.equal(formatDate({ year: 2000, month: 1, day: 1 }, ''), '');
});

test('formatDate zero-pads years below 1000 to four digits and keeps longer years intact', () => {
  assert.equal(formatDate({ year: 33, month: 4, day: 3 }, 'yyyy-mm-dd'), '0033-04-03');
  assert.equal(formatDate({ year: 999, month: 12, day: 31 }, 'yyyy'), '0999');
  assert.equal(formatDate({ year: 7, month: 1, day: 1 }, 'yy'), '07');
  assert.equal(formatDate({ year: 10000, month: 1, day: 1 }, 'yyyy'), '10000');
  assert.equal(formatDate({ year: -1, month: 1, day: 1 }, 'yyyy'), '-0001');
});

test('name tables are English, ordered and sized for the formatter', () => {
  assert.equal(WEEKDAY_NAMES.length, 7);
  assert.equal(WEEKDAY_NAMES[0], 'Monday');
  assert.equal(WEEKDAY_NAMES[6], 'Sunday');
  assert.equal(MONTH_NAMES.length, 12);
  assert.equal(MONTH_NAMES[0], 'January');
  assert.equal(MONTH_NAMES[11], 'December');
});
