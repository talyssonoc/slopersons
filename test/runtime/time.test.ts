import { test } from 'node:test';
import assert from 'node:assert/strict';
import { daysFromCivil } from '../../src/runtime/calendar.ts';
import {
  MILLISECONDS_PER_DAY,
  formatDateTime,
  formatTime,
  isValidTime,
  isoDateTime,
  isoTime,
  millisecondsFromTimeParts,
  parseIsoDateTime,
  parseIsoTime,
  splitEpochMs,
  timePartsFromMs,
  wrapIntoDay,
} from '../../src/runtime/time.ts';

test('time parts round-trip through milliseconds since midnight', () => {
  const parts = { hour: 23, minute: 59, second: 58, millisecond: 7 };
  assert.deepEqual(timePartsFromMs(millisecondsFromTimeParts(parts)), parts);
  assert.equal(millisecondsFromTimeParts({ hour: 0, minute: 0, second: 0, millisecond: 0 }), 0);
  assert.equal(millisecondsFromTimeParts({ hour: 23, minute: 59, second: 59, millisecond: 999 }), MILLISECONDS_PER_DAY - 1);
});

test('isValidTime enforces every component range', () => {
  assert.equal(isValidTime(0, 0, 0, 0), true);
  assert.equal(isValidTime(23, 59, 59, 999), true);
  assert.equal(isValidTime(24, 0, 0, 0), false);
  assert.equal(isValidTime(0, 60, 0, 0), false);
  assert.equal(isValidTime(0, 0, 60, 0), false);
  assert.equal(isValidTime(0, 0, 0, 1000), false);
  assert.equal(isValidTime(-1, 0, 0, 0), false);
  assert.equal(isValidTime(1.5, 0, 0, 0), false);
});

test('wrapIntoDay and splitEpochMs floor negative values', () => {
  assert.equal(wrapIntoDay(-1), MILLISECONDS_PER_DAY - 1);
  assert.equal(wrapIntoDay(MILLISECONDS_PER_DAY + 5), 5);
  assert.deepEqual(splitEpochMs(-1), { days: -1, millisecondsOfDay: MILLISECONDS_PER_DAY - 1 });
  assert.deepEqual(splitEpochMs(MILLISECONDS_PER_DAY * 3 + 42), { days: 3, millisecondsOfDay: 42 });
});

test('parseIsoTime accepts HH:MM, HH:MM:SS and up to three fraction digits', () => {
  assert.equal(parseIsoTime('12:30'), 45_000_000);
  assert.equal(parseIsoTime('12:30:15'), 45_015_000);
  assert.equal(parseIsoTime('12:30:15.5'), 45_015_500);
  assert.equal(parseIsoTime('12:30:15.25'), 45_015_250);
  assert.equal(parseIsoTime('12:30:15.250'), 45_015_250);
  assert.equal(parseIsoTime('00:00'), 0);
  for (const bad of ['24:00', '12:60', '12:30:60', '1:30', '12:30:15.', '12:30:15.1234', '', ' 12:30', '12-30', '１２:30', '12:30:15,5']) {
    assert.equal(parseIsoTime(bad), null, bad);
  }
});

test('parseIsoDateTime accepts T or space, an optional Z, and validates both halves', () => {
  const base = daysFromCivil(2026, 10, 23) * MILLISECONDS_PER_DAY;
  assert.equal(parseIsoDateTime('2026-10-23T15:16:00'), base + (15 * 3600 + 16 * 60) * 1000);
  assert.equal(parseIsoDateTime('2026-10-23T15:16'), base + (15 * 3600 + 16 * 60) * 1000);
  assert.equal(parseIsoDateTime('2026-10-23 15:16:00.250'), base + (15 * 3600 + 16 * 60) * 1000 + 250);
  assert.equal(parseIsoDateTime('2026-10-23T15:16:00Z'), base + (15 * 3600 + 16 * 60) * 1000);
  assert.equal(parseIsoDateTime('1969-12-31T23:59:59.999'), -1);
  for (const bad of ['2026-10-23', '2026-10-23X15:16', '2026-02-30T10:00', '2026-10-23T25:00', '2026-10-23T15:16:00+02:00', '2026-10-23T15:16:00ZZ']) {
    assert.equal(parseIsoDateTime(bad), null, bad);
  }
});

test('formatTime renders uppercase tokens and leaves other text alone', () => {
  const milliseconds = millisecondsFromTimeParts({ hour: 9, minute: 5, second: 7, millisecond: 42 });
  assert.equal(formatTime(milliseconds, 'HH:MM:SS.SSS'), '09:05:07.042');
  assert.equal(formatTime(milliseconds, 'H:M:S'), '9:5:7');
  assert.equal(formatTime(milliseconds, 'at HH past M'), 'at 09 past 5');
  assert.equal(formatTime(milliseconds, 'yyyy-mm-dd'), 'yyyy-mm-dd');
});

test('formatDateTime mixes date and time tokens, with lowercase mm as month and uppercase MM as minute', () => {
  const milliseconds = daysFromCivil(2024, 12, 25) * MILLISECONDS_PER_DAY + millisecondsFromTimeParts({ hour: 18, minute: 30, second: 0, millisecond: 0 });
  assert.equal(formatDateTime(milliseconds, 'yyyy-mm-dd HH:MM'), '2024-12-25 18:30');
  assert.equal(formatDateTime(milliseconds, 'dddd, mmmm d at H:MM'), 'Wednesday, December 25 at 18:30');
  assert.equal(formatDateTime(milliseconds, 'mm/MM'), '12/30');
});

test('iso forms omit the fraction when it is zero', () => {
  assert.equal(isoTime(0), '00:00:00');
  assert.equal(isoTime(45_015_250), '12:30:15.250');
  assert.equal(isoDateTime(0), '1970-01-01T00:00:00');
  assert.equal(isoDateTime(-1), '1969-12-31T23:59:59.999');
  assert.equal(isoDateTime(daysFromCivil(2026, 10, 23) * MILLISECONDS_PER_DAY + 55_000_000), '2026-10-23T15:16:40');
});
