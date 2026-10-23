import { test } from 'node:test';
import assert from 'node:assert/strict';
import { failure, output } from '../helpers/run.ts';

test('length counts code points', () => {
  assert.equal(output('"abc" -> length -> print\n"" -> length -> print'), '3\n0\n');
  assert.equal(output('"a👍b" -> length -> print'), '3\n');
});

test('chars splits into char values by code point', () => {
  assert.equal(output('"abc" -> chars -> print\n"" -> chars -> print'), '[`a` `b` `c`]\n[]\n');
  assert.equal(output('"a👍b" -> chars -> print'), '[`a` `👍` `b`]\n');
  assert.equal(output('"ab" -> chars -> each c | c -> type-of -> print'), 'char\nchar\n');
});

test('at returns the char at a code point index and errors outside the range', () => {
  assert.equal(output('"abc" -> at 0 -> print\n"abc" -> at 2 -> print'), 'a\nc\n');
  assert.equal(output('"a👍b" -> at 1 -> print\n"a👍b" -> at 2 -> print'), '👍\nb\n');
  assert.equal(output('"abc" -> at 1 -> type-of -> print'), 'char\n');
  assert.equal(failure('"abc" -> at 5').message, 'index 5 is out of range for a string of length 3');
  assert.equal(failure('"abc" -> at 3').message, 'index 3 is out of range for a string of length 3');
  assert.equal(failure('"a👍b" -> at -1').message, 'index -1 is out of range for a string of length 3');
  assert.equal(failure('"abc" -> at "x"').message, 'the index of `at` must be an int, got a string');
});

test('slice uses code point indexes and clamps both ends', () => {
  assert.equal(output('"hello" -> slice 1 3 -> print'), 'el\n');
  assert.equal(output('"a👍bc" -> slice 1 3 -> print'), '👍b\n');
  assert.equal(output('"abc" -> slice 1 10 -> print\n"abc" -> slice -5 2 -> print\n"abc" -> slice 2 1 -> print'), 'bc\nab\n\n');
  assert.equal(output('"👍" -> slice 0 99999999999999999999 -> print'), '👍\n');
  assert.equal(failure('"abc" -> slice 0 1.5').message, 'the end of `slice` must be an int, got a float');
});

test('upper and lower map every code point', () => {
  assert.equal(output('"Hello" -> upper -> print\n"Hello" -> lower -> print'), 'HELLO\nhello\n');
  assert.equal(output('"a👍b" -> upper -> print\n"A👍B" -> lower -> print'), 'A👍B\na👍b\n');
  assert.match(failure('1 -> upper').message, /^`upper` cannot be used with an int; it works on (char, )?string$/);
});

test('trim, trim-start and trim-end remove whitespace at the ends', () => {
  assert.equal(output('"  a b \\n" -> trim -> show -> print'), '"a b"\n');
  assert.equal(output('"  a b  " -> trim-start -> show -> print\n"  a b  " -> trim-end -> show -> print'), '"a b  "\n"  a b"\n');
  assert.equal(output('" 👍 " -> trim -> print\n" 👍 " -> trim-start -> show -> print\n" 👍 " -> trim-end -> show -> print'), '👍\n"👍 "\n" 👍"\n');
  assert.equal(failure('1 -> trim').message, '`trim` cannot be used with an int; it works on string');
});

test('split divides at every separator and an empty separator splits into code points', () => {
  assert.equal(output('"a,b,,c" -> split "," -> print\n"" -> split "," -> print'), '["a" "b" "" "c"]\n[""]\n');
  assert.equal(output('"👍a👍" -> split "👍" -> print'), '["" "a" ""]\n');
  assert.equal(output('"a👍b" -> split "" -> print'), '["a" "👍" "b"]\n');
  assert.equal(failure('"a" -> split 1').message, 'the separator of `split` must be a string, got an int');
});

test('contains, starts-with and ends-with answer with booleans', () => {
  assert.equal(output('"hello" -> contains "ell" -> print\n"hello" -> contains "z" -> print'), 'yes\nno\n');
  assert.equal(output('"a👍b" -> contains "👍b" -> print\n"a👍b" -> contains "ab" -> print'), 'yes\nno\n');
  assert.equal(output('"hello" -> starts-with "he" -> print\n"hello" -> starts-with "lo" -> print'), 'yes\nno\n');
  assert.equal(output('"👍ab" -> starts-with "👍a" -> print\n"ab👍" -> ends-with "b👍" -> print\n"ab👍" -> ends-with "b" -> print'), 'yes\nyes\nno\n');
  assert.equal(failure('"a" -> contains 1').message, 'the text to look for in `contains` must be a string, got an int');
  assert.equal(failure('"a" -> starts-with `a`').message, 'the prefix of `starts-with` must be a string, got a char');
  assert.equal(failure('"a" -> ends-with `a`').message, 'the suffix of `ends-with` must be a string, got a char');
});

test('index-of gives the first code point index or nothing', () => {
  assert.equal(output('"hello" -> index-of "l" -> print'), '2\n');
  assert.equal(output('"ab👍cd" -> index-of "cd" -> print\n"ab👍cd" -> index-of "👍" -> print'), '3\n2\n');
  assert.equal(output('"abc" -> index-of "z" -> print\n"abc" -> index-of "" -> print'), 'nothing\n0\n');
});

test('replace swaps every non-overlapping occurrence and rejects an empty needle', () => {
  assert.equal(output('"banana" -> replace "an" "AN" -> print\n"aaa" -> replace "aa" "b" -> print'), 'bANANa\nba\n');
  assert.equal(output('"a👍a" -> replace "a" "👍" -> print\n"a👍a" -> replace "👍" "" -> print'), '👍👍👍\naa\n');
  assert.equal(failure('"abc" -> replace "" "x"').message, '`replace` needs a non-empty text to look for');
  assert.equal(failure('"abc" -> replace "a" 1').message, 'the replacement of `replace` must be a string, got an int');
});

test('repeat with a string receiver concatenates copies', () => {
  assert.equal(output('"ab" -> repeat 3 -> print\n"ab" -> repeat 0 -> show -> print'), 'ababab\n""\n');
  assert.equal(output('"👍a" -> repeat 2 -> print'), '👍a👍a\n');
  assert.equal(output('2 -> repeat | "x" -> print'), 'x\nx\n');
  assert.equal(failure('"ab" -> repeat -1').message, 'the count of `repeat` cannot be negative, got -1');
  assert.equal(failure('"ab" -> repeat "x"').message, 'the count of `repeat` must be an int, got a string');
});

test('reverse works by code point', () => {
  assert.equal(output('"abc" -> reverse -> print'), 'cba\n');
  assert.equal(output('"a👍b" -> reverse -> print'), 'b👍a\n');
});

test('pad-left and pad-right fill with a char up to a code point width', () => {
  assert.equal(output('"7" -> pad-left 3 `0` -> print\n"ab" -> pad-right 4 `.` -> print'), '007\nab..\n');
  assert.equal(output('"👍" -> pad-left 3 `.` -> print\n"ab" -> pad-right 4 `👍` -> print'), '..👍\nab👍👍\n');
  assert.equal(output('"abcd" -> pad-left 2 `x` -> print\n"abcd" -> pad-right -1 `x` -> print'), 'abcd\nabcd\n');
  assert.equal(failure('"a" -> pad-left 3 "x"').message, 'the fill of `pad-left` must be a char, got a string');
  assert.equal(failure('"a" -> pad-right 3 "x"').message, 'the fill of `pad-right` must be a char, got a string');
  assert.equal(failure('"a" -> pad-left `3` `x`').message, 'the width of `pad-left` must be an int, got a char');
});

test('lines splits on line breaks and drops a trailing one', () => {
  assert.equal(output('"a\\nb\\n" -> lines -> print\n"a\\r\\nb" -> lines -> print\n"" -> lines -> print'), '["a" "b"]\n["a" "b"]\n[]\n');
  assert.equal(output('"👍\\n\\n👍" -> lines -> print'), '["👍" "" "👍"]\n');
});

test('words splits on runs of whitespace', () => {
  assert.equal(output('"  one two\\tthree  " -> words -> print\n"   " -> words -> print'), '["one" "two" "three"]\n[]\n');
  assert.equal(output('"a👍  b" -> words -> print'), '["a👍" "b"]\n');
});

test('is-empty is yes only for the empty string', () => {
  assert.equal(output('"" -> is-empty -> print\n" " -> is-empty -> print'), 'yes\nno\n');
  assert.equal(output('"👍" -> is-empty -> print'), 'no\n');
});

test('to-int parses an optional sign and decimal digits', () => {
  assert.equal(output('"42" -> to-int -> print\n"-42" -> to-int -> print\n"+7" -> to-int -> print'), '42\n-42\n7\n');
  assert.equal(output('"99999999999999999999" -> to-int -> print'), '99999999999999999999\n');
  assert.equal(output('"12" -> to-int -> type-of -> print'), 'int\n');
  assert.equal(failure('"abc" -> to-int').message, 'cannot convert "abc" to an int');
  assert.equal(failure('"👍" -> to-int').message, 'cannot convert "👍" to an int');
  assert.equal(failure('"1.5" -> to-int').message, 'cannot convert "1.5" to an int');
  assert.equal(failure('" 1" -> to-int').message, 'cannot convert " 1" to an int');
  assert.equal(failure('"a\\"b" -> to-int').message, 'cannot convert "a\\"b" to an int');
});

test('to-float parses decimal notation with an optional exponent', () => {
  assert.equal(output('"2.5" -> to-float -> print\n"3" -> to-float -> print\n"-1e2" -> to-float -> print'), '2.5\n3.0\n-100.0\n');
  assert.equal(output('"2.5" -> to-float -> type-of -> print'), 'float\n');
  assert.equal(failure('"x" -> to-float').message, 'cannot convert "x" to a float');
  assert.equal(failure('"1👍" -> to-float').message, 'cannot convert "1👍" to a float');
  assert.equal(failure('".5" -> to-float').message, 'cannot convert ".5" to a float');
});

test('to-string on a string is the identity', () => {
  assert.equal(output('"abc" -> to-string -> print\n"abc" -> to-string -> type-of -> print'), 'abc\nstring\n');
  assert.equal(output('"a👍" -> to-string -> print'), 'a👍\n');
});

test('from-chars joins an array of chars into a string', () => {
  assert.equal(output('[`a` `b` `c`] -> from-chars -> print\n[] -> from-chars -> show -> print'), 'abc\n""\n');
  assert.equal(output('[`a` `👍` `b`] -> from-chars -> print\n"a👍b" -> chars -> from-chars -> print'), 'a👍b\na👍b\n');
  assert.equal(output('[`a`] -> from-chars -> type-of -> print'), 'string\n');
  assert.equal(failure('[`a` 1] -> from-chars').message, 'element 1 of the input of `from-chars` must be a char, got an int');
  assert.equal(failure('[`a` "b"] -> from-chars').message, 'element 1 of the input of `from-chars` must be a char, got a string');
  assert.match(failure('"ab" -> from-chars').message, /^`from-chars` cannot be used with a string; it works on array$/);
});

test('each visits every char and honors stop', () => {
  assert.equal(output('"abc" -> each c | c -> print'), 'a\nb\nc\n');
  assert.equal(output('"a👍b" -> each c | c -> print'), 'a\n👍\nb\n');
  assert.equal(output('"a👍b" -> each c | c -> type-of -> print'), 'char\nchar\nchar\n');
  assert.equal(output('"a👍b" -> each c\n| c = `👍` ? stop\n| c -> print'), 'a\n');
  assert.equal(output('"ab" -> each c | c -> print\n-> print'), 'a\nb\nnothing\n');
  assert.equal(output('proc first-non-a s\n| s -> each c\n| | c /= `a` ? c -> out\n| nothing\n"aa👍b" -> first-non-a -> print'), '👍\n');
  assert.equal(failure('"ab" -> each 1').message, 'the body of `each` must be a procedure, got an int');
});

test('count tallies non-overlapping occurrences and rejects an empty needle', () => {
  assert.equal(output('"banana" -> count "an" -> print\n"aaaa" -> count "aa" -> print\n"abc" -> count "z" -> print'), '2\n2\n0\n');
  assert.equal(output('"a👍a👍a" -> count "👍" -> print\n"👍👍" -> count "👍👍" -> print'), '2\n1\n');
  assert.equal(failure('"abc" -> count ""').message, '`count` needs a non-empty text to look for');
  assert.equal(failure('"abc" -> count 1').message, 'the text to look for in `count` must be a string, got an int');
});

test('strings are immutable: operations return new strings', () => {
  assert.equal(output('"abc" => s\ns -> upper -> print\ns -> reverse -> print\ns -> replace "a" "x" -> print\ns -> print'), 'ABC\ncba\nxbc\nabc\n');
});

test('repeat refuses to build a string beyond the size limit', () => {
  assert.equal(
    failure('"ab" -> repeat 100000000000').message,
    '`repeat` would build a value of 200000000000 characters, which is more than the limit of 50000000',
  );
});
