import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  length,
  codePoints,
  charAt,
  slice,
  indexOf,
  lastIndexOf,
  contains,
  startsWith,
  endsWith,
  replaceAll,
  split,
  lines,
  words,
  trim,
  trimStart,
  trimEnd,
  padStart,
  padEnd,
  repeat,
  reverse,
  upper,
  lower,
  isLetter,
  isDigit,
  isSpace,
  parseIntText,
  parseFloatText,
  formatFloat,
} from '../../src/runtime/text.ts';

test('length counts code points, not UTF-16 units', () => {
  assert.equal(length(''), 0);
  assert.equal(length('abc'), 3);
  assert.equal(length('a👍b'), 3);
  assert.equal(length('𝄞𝄞'), 2);
});

test('codePoints yields one element per code point', () => {
  assert.deepEqual(codePoints(''), []);
  assert.deepEqual(codePoints('abc'), ['a', 'b', 'c']);
  assert.deepEqual(codePoints('a👍b'), ['a', '👍', 'b']);
});

test('charAt indexes by code point and returns null out of range', () => {
  assert.equal(charAt('abc', 0), 'a');
  assert.equal(charAt('abc', 2), 'c');
  assert.equal(charAt('abc', 3), null);
  assert.equal(charAt('abc', -1), null);
  assert.equal(charAt('a👍b', 1), '👍');
  assert.equal(charAt('a👍b', 2), 'b');
  assert.equal(charAt('a👍b', 3), null);
});

test('slice uses code point indices and clamps both ends', () => {
  assert.equal(slice('hello', 1, 3), 'el');
  assert.equal(slice('hello', -5, 10), 'hello');
  assert.equal(slice('hello', 3, 1), '');
  assert.equal(slice('hello', 2, 2), '');
  assert.equal(slice('a👍b', 1, 2), '👍');
  assert.equal(slice('a👍b', 1, 3), '👍b');
  assert.equal(slice('👍👍👍', 0, 2), '👍👍');
});

test('indexOf finds the first occurrence at or after from', () => {
  assert.equal(indexOf('abcabc', 'bc'), 1);
  assert.equal(indexOf('abcabc', 'bc', 2), 4);
  assert.equal(indexOf('abcabc', 'bc', 5), -1);
  assert.equal(indexOf('abc', 'd'), -1);
  assert.equal(indexOf('abc', 'abcd'), -1);
  assert.equal(indexOf('👍👍x', 'x'), 2);
  assert.equal(indexOf('a👍b👍', '👍', 2), 3);
});

test('indexOf with an empty needle returns from clamped into range', () => {
  assert.equal(indexOf('abc', ''), 0);
  assert.equal(indexOf('abc', '', 2), 2);
  assert.equal(indexOf('abc', '', 10), 3);
  assert.equal(indexOf('abc', '', -4), 0);
  assert.equal(indexOf('', ''), 0);
});

test('lastIndexOf finds the last occurrence by code point index', () => {
  assert.equal(lastIndexOf('abcabc', 'bc'), 4);
  assert.equal(lastIndexOf('abcabc', 'd'), -1);
  assert.equal(lastIndexOf('abc', 'abcd'), -1);
  assert.equal(lastIndexOf('abc', ''), 3);
  assert.equal(lastIndexOf('👍x👍x', 'x'), 3);
  assert.equal(lastIndexOf('👍x👍x', '👍'), 2);
});

test('contains, startsWith and endsWith match by code point', () => {
  assert.equal(contains('hello', 'ell'), true);
  assert.equal(contains('hello', 'xyz'), false);
  assert.equal(contains('a👍b', '👍'), true);
  assert.equal(contains('a👍b', '👎'), false);

  assert.equal(startsWith('hello', 'he'), true);
  assert.equal(startsWith('hello', 'lo'), false);
  assert.equal(startsWith('hello', ''), true);
  assert.equal(startsWith('he', 'hello'), false);
  assert.equal(startsWith('👍ab', '👍a'), true);
  assert.equal(startsWith('👍ab', 'a'), false);

  assert.equal(endsWith('hello', 'lo'), true);
  assert.equal(endsWith('hello', 'he'), false);
  assert.equal(endsWith('hello', ''), true);
  assert.equal(endsWith('lo', 'hello'), false);
  assert.equal(endsWith('ab👍', 'b👍'), true);
  assert.equal(endsWith('ab👍', 'b'), false);
});

test('replaceAll replaces non-overlapping matches left to right', () => {
  assert.equal(replaceAll('a-b-c', '-', '+'), 'a+b+c');
  assert.equal(replaceAll('aaa', 'aa', 'b'), 'ba');
  assert.equal(replaceAll('abc', 'x', 'y'), 'abc');
  assert.equal(replaceAll('abc', 'abc', ''), '');
  assert.equal(replaceAll('a👍a', '👍', '-'), 'a-a');
  assert.equal(replaceAll('x👍', 'x', '👍'), '👍👍');
});

test('replaceAll with an empty needle returns the input unchanged', () => {
  assert.equal(replaceAll('abc', '', '-'), 'abc');
  assert.equal(replaceAll('', '', '-'), '');
});

test('split keeps empty fields between adjacent separators', () => {
  assert.deepEqual(split('a,b,,c', ','), ['a', 'b', '', 'c']);
  assert.deepEqual(split(',a,', ','), ['', 'a', '']);
  assert.deepEqual(split('abc', ','), ['abc']);
  assert.deepEqual(split('a::b::c', '::'), ['a', 'b', 'c']);
  assert.deepEqual(split('a👍b👍c', '👍'), ['a', 'b', 'c']);
  assert.deepEqual(split('👍,👍', ','), ['👍', '👍']);
});

test('split with an empty separator yields code points', () => {
  assert.deepEqual(split('abc', ''), ['a', 'b', 'c']);
  assert.deepEqual(split('👍x👍', ''), ['👍', 'x', '👍']);
});

test('split on empty input depends on the separator', () => {
  assert.deepEqual(split('', ','), ['']);
  assert.deepEqual(split('', ''), []);
});

test('lines splits on newline, strips carriage returns and drops a trailing empty line', () => {
  assert.deepEqual(lines('a\nb\nc'), ['a', 'b', 'c']);
  assert.deepEqual(lines('a\nb\n'), ['a', 'b']);
  assert.deepEqual(lines('a\n\nb'), ['a', '', 'b']);
  assert.deepEqual(lines('a\n\n'), ['a', '']);
  assert.deepEqual(lines('a\r\nb\r\n'), ['a', 'b']);
  assert.deepEqual(lines(''), []);
  assert.deepEqual(lines('\n'), ['']);
  assert.deepEqual(lines('👍\r\nb\n'), ['👍', 'b']);
});

test('words splits on whitespace runs without empty elements', () => {
  assert.deepEqual(words('  hello   world \t\n'), ['hello', 'world']);
  assert.deepEqual(words(''), []);
  assert.deepEqual(words('   '), []);
  assert.deepEqual(words('a　b'), ['a', 'b']);
  assert.deepEqual(words('  👍  b\tc\n'), ['👍', 'b', 'c']);
});

test('trim, trimStart and trimEnd strip Unicode whitespace', () => {
  assert.equal(trim('  abc  '), 'abc');
  assert.equal(trim('\t\n abc \r\n'), 'abc');
  assert.equal(trim('　abc '), 'abc');
  assert.equal(trim('   '), '');
  assert.equal(trim(''), '');
  assert.equal(trim('  👍  '), '👍');

  assert.equal(trimStart('  abc  '), 'abc  ');
  assert.equal(trimStart('   '), '');
  assert.equal(trimStart('  👍 '), '👍 ');

  assert.equal(trimEnd('  abc  '), '  abc');
  assert.equal(trimEnd('   '), '');
  assert.equal(trimEnd(' 👍  '), ' 👍');
});

test('padStart and padEnd pad to a code point width', () => {
  assert.equal(padStart('ab', 5, '*'), '***ab');
  assert.equal(padStart('abcdef', 3, '*'), 'abcdef');
  assert.equal(padStart('abc', 3, '*'), 'abc');
  assert.equal(padStart('👍', 3, 'x'), 'xx👍');
  assert.equal(padStart('👍👍👍', 2, 'x'), '👍👍👍');
  assert.equal(padStart('ab', 4, '👍'), '👍👍ab');

  assert.equal(padEnd('ab', 5, '*'), 'ab***');
  assert.equal(padEnd('abcdef', 3, '*'), 'abcdef');
  assert.equal(padEnd('👍', 3, 'x'), '👍xx');
  assert.equal(padEnd('ab', 4, '👍'), 'ab👍👍');
});

test('repeat concatenates count copies', () => {
  assert.equal(repeat('ab', 3), 'ababab');
  assert.equal(repeat('ab', 0), '');
  assert.equal(repeat('', 5), '');
  assert.equal(repeat('👍', 3), '👍👍👍');
  assert.equal(length(repeat('👍', 3)), 3);
});

test('reverse reverses by code point without splitting surrogate pairs', () => {
  assert.equal(reverse('abc'), 'cba');
  assert.equal(reverse(''), '');
  assert.equal(reverse('a👍b'), 'b👍a');
  assert.equal(reverse('👍𝄞'), '𝄞👍');
});

test('upper and lower map each code point', () => {
  assert.equal(upper('hello'), 'HELLO');
  assert.equal(lower('HELLO'), 'hello');
  assert.equal(upper('straße'), 'STRASSE');
  assert.equal(upper('a👍ß'), 'A👍SS');
  assert.equal(upper('\u{10428}'), '\u{10400}');
  assert.equal(lower('\u{10400}'), '\u{10428}');
  assert.equal(lower('A👍B'), 'a👍b');
});

test('isLetter, isDigit and isSpace classify a single code point', () => {
  assert.equal(isLetter('a'), true);
  assert.equal(isLetter('é'), true);
  assert.equal(isLetter('1'), false);
  assert.equal(isLetter(' '), false);
  assert.equal(isLetter('\u{1D400}'), true);
  assert.equal(isLetter('👍'), false);

  assert.equal(isDigit('7'), true);
  assert.equal(isDigit('a'), false);
  assert.equal(isDigit('\u{1D7D8}'), true);
  assert.equal(isDigit('👍'), false);

  assert.equal(isSpace(' '), true);
  assert.equal(isSpace('\t'), true);
  assert.equal(isSpace('\n'), true);
  assert.equal(isSpace('　'), true);
  assert.equal(isSpace('a'), false);
  assert.equal(isSpace('👍'), false);
});

test('parseIntText parses optionally signed ASCII digits into a bigint', () => {
  assert.equal(parseIntText('0'), 0n);
  assert.equal(parseIntText('123'), 123n);
  assert.equal(parseIntText('-42'), -42n);
  assert.equal(parseIntText('+7'), 7n);
  assert.equal(parseIntText('99999999999999999999999'), 99999999999999999999999n);
});

test('parseIntText returns null for anything but digits', () => {
  assert.equal(parseIntText(''), null);
  assert.equal(parseIntText('+'), null);
  assert.equal(parseIntText('-'), null);
  assert.equal(parseIntText(' 1'), null);
  assert.equal(parseIntText('1 '), null);
  assert.equal(parseIntText('1_000'), null);
  assert.equal(parseIntText('12a'), null);
  assert.equal(parseIntText('1.5'), null);
  assert.equal(parseIntText('--1'), null);
  assert.equal(parseIntText('\u{1D7D8}'), null);
  assert.equal(parseIntText('1👍'), null);
});

test('parseFloatText parses sign, digits, fraction and exponent', () => {
  assert.equal(parseFloatText('1.5'), 1.5);
  assert.equal(parseFloatText('-2'), -2);
  assert.equal(parseFloatText('+3.25'), 3.25);
  assert.equal(parseFloatText('1e3'), 1000);
  assert.equal(parseFloatText('1.5E-2'), 0.015);
  assert.equal(parseFloatText('2e+2'), 200);
  assert.equal(parseFloatText('0.1'), 0.1);
});

test('parseFloatText returns null, never NaN, for invalid shapes', () => {
  for (const input of ['', 'Infinity', 'NaN', ' 1', '1 ', '1.', '.5', '1e', '1e+', '--1', '1.5.2', '0x10', '1_0', 'abc', '1👍', '1.\u{1D7D8}']) {
    assert.equal(parseFloatText(input), null, `input ${JSON.stringify(input)}`);
  }
});

test('formatFloat always includes a decimal point', () => {
  assert.equal(formatFloat(1), '1.0');
  assert.equal(formatFloat(-3), '-3.0');
  assert.equal(formatFloat(0), '0.0');
  assert.equal(formatFloat(1.5), '1.5');
  assert.equal(formatFloat(-2.25), '-2.25');
  assert.equal(formatFloat(0.1 + 0.2), '0.30000000000000004');
});

test('formatFloat keeps the sign of negative zero', () => {
  assert.equal(formatFloat(-0), '-0.0');
});

test('formatFloat inserts .0 before an exponent', () => {
  assert.equal(formatFloat(1e21), '1.0e+21');
  assert.equal(formatFloat(-1e21), '-1.0e+21');
  assert.equal(formatFloat(1e-7), '1.0e-7');
  assert.equal(formatFloat(1.5e21), '1.5e+21');
});
