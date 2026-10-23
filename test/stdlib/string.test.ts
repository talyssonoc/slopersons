import { test } from 'node:test';
import assert from 'node:assert/strict';
import { failure, output } from '../helpers/run.ts';

test('string/length counts code points', () => {
  assert.equal(output('"abc" -> string/length -> io/print-ln\n"" -> string/length -> io/print-ln'), '3\n0\n');
  assert.equal(output('"a👍b" -> string/length -> io/print-ln'), '3\n');
});

test('string/chars splits into char values by code point', () => {
  assert.equal(output('"abc" -> string/chars -> io/print-ln\n"" -> string/chars -> io/print-ln'), '[`a` `b` `c`]\n[]\n');
  assert.equal(output('"a👍b" -> string/chars -> io/print-ln'), '[`a` `👍` `b`]\n');
  assert.equal(output('"ab" -> string/chars -> array/each c | c -> type-of -> io/print-ln'), 'char\nchar\n');
});

test('string/at returns the char at a code point index and errors outside the range', () => {
  assert.equal(output('"abc" -> string/at 0 -> io/print-ln\n"abc" -> string/at 2 -> io/print-ln'), 'a\nc\n');
  assert.equal(output('"a👍b" -> string/at 1 -> io/print-ln\n"a👍b" -> string/at 2 -> io/print-ln'), '👍\nb\n');
  assert.equal(output('"abc" -> string/at 1 -> type-of -> io/print-ln'), 'char\n');
  assert.equal(failure('"abc" -> string/at 5').message, 'index 5 is out of range for a string of length 3');
  assert.equal(failure('"abc" -> string/at 3').message, 'index 3 is out of range for a string of length 3');
  assert.equal(failure('"a👍b" -> string/at -1').message, 'index -1 is out of range for a string of length 3');
  assert.equal(failure('"abc" -> string/at "x"').message, 'the index of `string/at` must be an int, got a string');
});

test('string/slice uses code point indexes and clamps both ends', () => {
  assert.equal(output('"hello" -> string/slice 1 3 -> io/print-ln'), 'el\n');
  assert.equal(output('"a👍bc" -> string/slice 1 3 -> io/print-ln'), '👍b\n');
  assert.equal(
    output('"abc" -> string/slice 1 10 -> io/print-ln\n"abc" -> string/slice -5 2 -> io/print-ln\n"abc" -> string/slice 2 1 -> io/print-ln'),
    'bc\nab\n\n',
  );
  assert.equal(output('"👍" -> string/slice 0 99999999999999999999 -> io/print-ln'), '👍\n');
  assert.equal(failure('"abc" -> string/slice 0 1.5').message, 'the end of `string/slice` must be an int, got a float');
});

test('string/upper and string/lower map every code point', () => {
  assert.equal(output('"Hello" -> string/upper -> io/print-ln\n"Hello" -> string/lower -> io/print-ln'), 'HELLO\nhello\n');
  assert.equal(output('"a👍b" -> string/upper -> io/print-ln\n"A👍B" -> string/lower -> io/print-ln'), 'A👍B\na👍b\n');
  assert.equal(failure('1 -> string/upper').message, 'the input of `string/upper` must be a string, got an int');
  assert.equal(failure('`a` -> string/lower').message, 'the input of `string/lower` must be a string, got a char');
});

test('string/trim, string/trim-start and string/trim-end remove whitespace at the ends', () => {
  assert.equal(output('"  a b \\n" -> string/trim -> show -> io/print-ln'), '"a b"\n');
  assert.equal(
    output('"  a b  " -> string/trim-start -> show -> io/print-ln\n"  a b  " -> string/trim-end -> show -> io/print-ln'),
    '"a b  "\n"  a b"\n',
  );
  assert.equal(
    output('" 👍 " -> string/trim -> io/print-ln\n" 👍 " -> string/trim-start -> show -> io/print-ln\n" 👍 " -> string/trim-end -> show -> io/print-ln'),
    '👍\n"👍 "\n" 👍"\n',
  );
  assert.equal(failure('1 -> string/trim').message, 'the input of `string/trim` must be a string, got an int');
});

test('string/split divides at every separator and an empty separator splits into code points', () => {
  assert.equal(output('"a,b,,c" -> string/split "," -> io/print-ln\n"" -> string/split "," -> io/print-ln'), '["a" "b" "" "c"]\n[""]\n');
  assert.equal(output('"👍a👍" -> string/split "👍" -> io/print-ln'), '["" "a" ""]\n');
  assert.equal(output('"a👍b" -> string/split "" -> io/print-ln'), '["a" "👍" "b"]\n');
  assert.equal(failure('"a" -> string/split 1').message, 'the separator of `string/split` must be a string, got an int');
  assert.equal(failure('"a" -> string/split').message, '`string/split` expects 2 arguments, got 1');
});

test('string/contains, string/starts-with and string/ends-with answer with booleans', () => {
  assert.equal(output('"hello" -> string/contains "ell" -> io/print-ln\n"hello" -> string/contains "z" -> io/print-ln'), 'yes\nno\n');
  assert.equal(output('"a👍b" -> string/contains "👍b" -> io/print-ln\n"a👍b" -> string/contains "ab" -> io/print-ln'), 'yes\nno\n');
  assert.equal(output('"hello" -> string/starts-with "he" -> io/print-ln\n"hello" -> string/starts-with "lo" -> io/print-ln'), 'yes\nno\n');
  assert.equal(
    output('"👍ab" -> string/starts-with "👍a" -> io/print-ln\n"ab👍" -> string/ends-with "b👍" -> io/print-ln\n"ab👍" -> string/ends-with "b" -> io/print-ln'),
    'yes\nyes\nno\n',
  );
  assert.equal(failure('"a" -> string/contains 1').message, 'the text to look for in `string/contains` must be a string, got an int');
  assert.equal(failure('"a" -> string/starts-with `a`').message, 'the prefix of `string/starts-with` must be a string, got a char');
  assert.equal(failure('"a" -> string/ends-with `a`').message, 'the suffix of `string/ends-with` must be a string, got a char');
});

test('string/index-of gives the first code point index or nothing', () => {
  assert.equal(output('"hello" -> string/index-of "l" -> io/print-ln'), '2\n');
  assert.equal(output('"ab👍cd" -> string/index-of "cd" -> io/print-ln\n"ab👍cd" -> string/index-of "👍" -> io/print-ln'), '3\n2\n');
  assert.equal(output('"abc" -> string/index-of "z" -> io/print-ln\n"abc" -> string/index-of "" -> io/print-ln'), 'nothing\n0\n');
  assert.equal(failure('"a" -> string/index-of 1').message, 'the text to look for in `string/index-of` must be a string, got an int');
});

test('string/replace swaps every non-overlapping occurrence and rejects an empty needle', () => {
  assert.equal(output('"banana" -> string/replace "an" "AN" -> io/print-ln\n"aaa" -> string/replace "aa" "b" -> io/print-ln'), 'bANANa\nba\n');
  assert.equal(output('"a👍a" -> string/replace "a" "👍" -> io/print-ln\n"a👍a" -> string/replace "👍" "" -> io/print-ln'), '👍👍👍\naa\n');
  assert.equal(failure('"abc" -> string/replace "" "x"').message, '`string/replace` needs a non-empty text to look for');
  assert.equal(failure('"abc" -> string/replace "a" 1').message, 'the replacement of `string/replace` must be a string, got an int');
});

test('string/repeat concatenates copies of the string', () => {
  assert.equal(output('"ab" -> string/repeat 3 -> io/print-ln\n"ab" -> string/repeat 0 -> show -> io/print-ln'), 'ababab\n""\n');
  assert.equal(output('"👍a" -> string/repeat 2 -> io/print-ln'), '👍a👍a\n');
  assert.equal(failure('"ab" -> string/repeat -1').message, 'the count of `string/repeat` cannot be negative, got -1');
  assert.equal(failure('"ab" -> string/repeat "x"').message, 'the count of `string/repeat` must be an int, got a string');
  assert.equal(failure('2 -> string/repeat 3').message, 'the input of `string/repeat` must be a string, got an int');
});

test('string/reverse works by code point', () => {
  assert.equal(output('"abc" -> string/reverse -> io/print-ln'), 'cba\n');
  assert.equal(output('"a👍b" -> string/reverse -> io/print-ln'), 'b👍a\n');
});

test('string/pad-left and string/pad-right fill with a char up to a code point width', () => {
  assert.equal(output('"7" -> string/pad-left 3 `0` -> io/print-ln\n"ab" -> string/pad-right 4 `.` -> io/print-ln'), '007\nab..\n');
  assert.equal(output('"👍" -> string/pad-left 3 `.` -> io/print-ln\n"ab" -> string/pad-right 4 `👍` -> io/print-ln'), '..👍\nab👍👍\n');
  assert.equal(output('"abcd" -> string/pad-left 2 `x` -> io/print-ln\n"abcd" -> string/pad-right -1 `x` -> io/print-ln'), 'abcd\nabcd\n');
  assert.equal(failure('"a" -> string/pad-left 3 "x"').message, 'the fill of `string/pad-left` must be a char, got a string');
  assert.equal(failure('"a" -> string/pad-right 3 "x"').message, 'the fill of `string/pad-right` must be a char, got a string');
  assert.equal(failure('"a" -> string/pad-left `3` `x`').message, 'the width of `string/pad-left` must be an int, got a char');
});

test('string/lines splits on line breaks and drops a trailing one', () => {
  assert.equal(
    output('"a\\nb\\n" -> string/lines -> io/print-ln\n"a\\r\\nb" -> string/lines -> io/print-ln\n"" -> string/lines -> io/print-ln'),
    '["a" "b"]\n["a" "b"]\n[]\n',
  );
  assert.equal(output('"👍\\n\\n👍" -> string/lines -> io/print-ln'), '["👍" "" "👍"]\n');
});

test('string/words splits on runs of whitespace', () => {
  assert.equal(output('"  one two\\tthree  " -> string/words -> io/print-ln\n"   " -> string/words -> io/print-ln'), '["one" "two" "three"]\n[]\n');
  assert.equal(output('"a👍  b" -> string/words -> io/print-ln'), '["a👍" "b"]\n');
});

test('string/is-empty is yes only for the empty string', () => {
  assert.equal(output('"" -> string/is-empty -> io/print-ln\n" " -> string/is-empty -> io/print-ln'), 'yes\nno\n');
  assert.equal(output('"👍" -> string/is-empty -> io/print-ln'), 'no\n');
});

test('string/to-int parses an optional sign and decimal digits', () => {
  assert.equal(output('"42" -> string/to-int -> io/print-ln\n"-42" -> string/to-int -> io/print-ln\n"+7" -> string/to-int -> io/print-ln'), '42\n-42\n7\n');
  assert.equal(output('"99999999999999999999" -> string/to-int -> io/print-ln'), '99999999999999999999\n');
  assert.equal(output('"12" -> string/to-int -> type-of -> io/print-ln'), 'int\n');
  assert.equal(failure('"abc" -> string/to-int').message, 'cannot convert "abc" to an int');
  assert.equal(failure('"👍" -> string/to-int').message, 'cannot convert "👍" to an int');
  assert.equal(failure('"1.5" -> string/to-int').message, 'cannot convert "1.5" to an int');
  assert.equal(failure('" 1" -> string/to-int').message, 'cannot convert " 1" to an int');
  assert.equal(failure('"a\\"b" -> string/to-int').message, 'cannot convert "a\\"b" to an int');
});

test('string/to-float parses decimal notation with an optional exponent', () => {
  assert.equal(
    output('"2.5" -> string/to-float -> io/print-ln\n"3" -> string/to-float -> io/print-ln\n"-1e2" -> string/to-float -> io/print-ln'),
    '2.5\n3.0\n-100.0\n',
  );
  assert.equal(output('"2.5" -> string/to-float -> type-of -> io/print-ln'), 'float\n');
  assert.equal(failure('"x" -> string/to-float').message, 'cannot convert "x" to a float');
  assert.equal(failure('"1👍" -> string/to-float').message, 'cannot convert "1👍" to a float');
  assert.equal(failure('".5" -> string/to-float').message, 'cannot convert ".5" to a float');
});

test('string/to-string on a string is the identity', () => {
  assert.equal(output('"abc" -> string/to-string -> io/print-ln\n"abc" -> string/to-string -> type-of -> io/print-ln'), 'abc\nstring\n');
  assert.equal(output('"a👍" -> string/to-string -> io/print-ln'), 'a👍\n');
});

test('string/from-chars joins an array of chars into a string', () => {
  assert.equal(output('[`a` `b` `c`] -> string/from-chars -> io/print-ln\n[] -> string/from-chars -> show -> io/print-ln'), 'abc\n""\n');
  assert.equal(
    output('[`a` `👍` `b`] -> string/from-chars -> io/print-ln\n"a👍b" -> string/chars -> string/from-chars -> io/print-ln'),
    'a👍b\na👍b\n',
  );
  assert.equal(output('[`a`] -> string/from-chars -> type-of -> io/print-ln'), 'string\n');
  assert.equal(failure('[`a` 1] -> string/from-chars').message, 'element 1 of the input of `string/from-chars` must be a char, got an int');
  assert.equal(failure('[`a` "b"] -> string/from-chars').message, 'element 1 of the input of `string/from-chars` must be a char, got a string');
  assert.equal(failure('"ab" -> string/from-chars').message, 'the input of `string/from-chars` must be an array, got a string');
});

test('string/each visits every char and honors stop', () => {
  assert.equal(output('"abc" -> string/each c | c -> io/print-ln'), 'a\nb\nc\n');
  assert.equal(output('"a👍b" -> string/each c | c -> io/print-ln'), 'a\n👍\nb\n');
  assert.equal(output('"a👍b" -> string/each c | c -> type-of -> io/print-ln'), 'char\nchar\nchar\n');
  assert.equal(output('"a👍b" -> string/each c\n| c = `👍` ? stop\n| c -> io/print-ln'), 'a\n');
  assert.equal(output('"ab" -> string/each c | c -> io/print-ln\n-> io/print-ln'), 'a\nb\nnothing\n');
  assert.equal(
    output('proc first-non-a s\n| s -> string/each c\n| | c /= `a` ? c -> out\n| nothing\n"aa👍b" -> first-non-a -> io/print-ln'),
    '👍\n',
  );
  assert.equal(failure('"ab" -> string/each 1').message, 'the body of `string/each` must be a procedure, got an int');
  assert.equal(failure('[`a`] -> string/each c | c').message, 'the input of `string/each` must be a string, got an array');
});

test('string/count tallies non-overlapping occurrences and rejects an empty needle', () => {
  assert.equal(
    output('"banana" -> string/count "an" -> io/print-ln\n"aaaa" -> string/count "aa" -> io/print-ln\n"abc" -> string/count "z" -> io/print-ln'),
    '2\n2\n0\n',
  );
  assert.equal(output('"a👍a👍a" -> string/count "👍" -> io/print-ln\n"👍👍" -> string/count "👍👍" -> io/print-ln'), '2\n1\n');
  assert.equal(failure('"abc" -> string/count ""').message, '`string/count` needs a non-empty text to look for');
  assert.equal(failure('"abc" -> string/count 1').message, 'the text to look for in `string/count` must be a string, got an int');
});

test('strings are immutable: operations return new strings', () => {
  assert.equal(
    output('"abc" => s\ns -> string/upper -> io/print-ln\ns -> string/reverse -> io/print-ln\ns -> string/replace "a" "x" -> io/print-ln\ns -> io/print-ln'),
    'ABC\ncba\nxbc\nabc\n',
  );
});

test('string/repeat refuses to build a string beyond the size limit', () => {
  assert.equal(
    failure('"ab" -> string/repeat 100000000000').message,
    '`string/repeat` would build a value of 200000000000 characters, which is more than the limit of 50000000',
  );
});
