# String builtins

These functions live in the `string` module and are called with their qualified name, as in `text -> string/upper`. Strings are immutable: every operation here returns a new string and leaves its input untouched. Positions, lengths and widths count code points, not UTF-16 units, so `"a👍b"` has length 3 and `👍` sits at index 1. Other modules have functions with the same short names (`array/length`, `char/upper`); they are separate functions that take their own module's type. Type errors follow the convention from the core page: `the input of \`string/trim\` must be a string, got an int`.

## length

`text -> string/length`

Returns the number of code points in `text` as an int.

```
"a👍b" -> string/length -> io/print-line   ~ 3
```

## chars

`text -> string/chars`

Returns an array with one char per code point of `text`.

```
"a👍b" -> string/chars -> io/print-line    ~ [`a` `👍` `b`]
```

## at

`text -> string/at index`

Returns the char at code point position `index`, counting from 0.

```
"a👍b" -> string/at 1 -> io/print-line     ~ 👍
```

Errors: `index` is not an int; `index` is outside `0` to `length - 1`, reported as `index 5 is out of range for a string of length 3`.

## slice

`text -> string/slice start end`

Returns the code points from `start` (inclusive) to `end` (exclusive). Both bounds are clamped into the string, so an `end` past the length is not an error, and `start >= end` yields `""`.

```
"a👍bc" -> string/slice 1 3 -> io/print-line  ~ 👍b
"abc" -> string/slice 1 10 -> io/print-line   ~ bc
```

Errors: `start` or `end` is not an int.

## upper

`text -> string/upper`

Returns `text` with every code point in upper case.

```
"héllo" -> string/upper -> io/print-line   ~ HÉLLO
```

## lower

`text -> string/lower`

Returns `text` with every code point in lower case.

```
"HÉLLO" -> string/lower -> io/print-line   ~ héllo
```

## trim

`text -> string/trim`

Returns `text` without leading and trailing whitespace (spaces, tabs, line breaks and other Unicode spaces).

```
"  a b \n" -> string/trim -> show -> io/print-line   ~ "a b"
```

## trim-start

`text -> string/trim-start`

Returns `text` without leading whitespace.

```
"  a  " -> string/trim-start -> show -> io/print-line   ~ "a  "
```

## trim-end

`text -> string/trim-end`

Returns `text` without trailing whitespace.

```
"  a  " -> string/trim-end -> show -> io/print-line   ~ "  a"
```

## split

`text -> string/split separator`

Returns the array of pieces between occurrences of `separator`. Adjacent separators produce empty strings, and an empty `text` gives `[""]`. An empty `separator` splits into one-code-point strings.

```
"a,b,,c" -> string/split "," -> io/print-line   ~ ["a" "b" "" "c"]
"a👍b" -> string/split "" -> io/print-line       ~ ["a" "👍" "b"]
```

Errors: `separator` is not a string.

## contains

`text -> string/contains needle`

Returns `yes` when `needle` occurs in `text`.

```
"a👍b" -> string/contains "👍b" -> io/print-line   ~ yes
```

Errors: `needle` is not a string.

## starts-with

`text -> string/starts-with prefix`

Returns `yes` when `text` begins with `prefix`.

```
"hello" -> string/starts-with "he" -> io/print-line   ~ yes
```

Errors: `prefix` is not a string.

## ends-with

`text -> string/ends-with suffix`

Returns `yes` when `text` ends with `suffix`.

```
"ab👍" -> string/ends-with "b👍" -> io/print-line   ~ yes
```

Errors: `suffix` is not a string.

## index-of

`text -> string/index-of needle`

Returns the code point index of the first occurrence of `needle` as an int, or `nothing` when `needle` does not occur. This is one of the few builtins whose result can be `nothing`; compare with `= nothing` before using the index.

```
"ab👍cd" -> string/index-of "cd" -> io/print-line  ~ 3
"abc" -> string/index-of "z" -> io/print-line      ~ nothing
```

Errors: `needle` is not a string.

## replace

`text -> string/replace old new`

Returns `text` with every non-overlapping occurrence of `old` replaced by `new`, scanning left to right.

```
"banana" -> string/replace "an" "AN" -> io/print-line  ~ bANANa
"aaa" -> string/replace "aa" "b" -> io/print-line      ~ ba
```

Errors: `old` or `new` is not a string; `old` is empty, reported as `` `replace` needs a non-empty text to look for ``.

## repeat

`text -> string/repeat count`

Returns `count` copies of `text` joined together. `0` gives `""`. To run a body a number of times instead, use `int/times` from the int page.

```
"👍a" -> string/repeat 2 -> io/print-line   ~ 👍a👍a
```

Errors: `count` is not an int; `count` is negative.

## reverse

`text -> string/reverse`

Returns the code points of `text` in reverse order.

```
"a👍b" -> string/reverse -> io/print-line   ~ b👍a
```

## pad-left

`text -> string/pad-left width fill`

Returns `text` preceded by as many `fill` chars as needed to reach `width` code points. A `text` already at least `width` long comes back unchanged.

```
"7" -> string/pad-left 3 `0` -> io/print-line   ~ 007
"👍" -> string/pad-left 3 `.` -> io/print-line  ~ ..👍
```

Errors: `width` is not an int; `fill` is not a char.

## pad-right

`text -> string/pad-right width fill`

Returns `text` followed by as many `fill` chars as needed to reach `width` code points. A `text` already at least `width` long comes back unchanged.

```
"ab" -> string/pad-right 4 `.` -> io/print-line   ~ ab..
```

Errors: `width` is not an int; `fill` is not a char.

## lines

`text -> string/lines`

Returns the array of lines in `text`, split at `\n`. A `\r` before a line break is dropped, and a trailing line break does not produce an empty last line.

```
"a\r\nb\n" -> string/lines -> io/print-line   ~ ["a" "b"]
```

## words

`text -> string/words`

Returns the array of maximal runs of non-whitespace in `text`. Leading, trailing and repeated whitespace produce no empty strings.

```
"  one two\tthree  " -> string/words -> io/print-line   ~ ["one" "two" "three"]
```

## is-empty

`text -> string/is-empty`

Returns `yes` when `text` has no code points.

```
"" -> string/is-empty -> io/print-line   ~ yes
" " -> string/is-empty -> io/print-line  ~ no
```

## to-int

`text -> string/to-int`

Parses `text` as an int: an optional `+` or `-` followed by one or more decimal digits, with nothing else around them. Ints are arbitrary precision, so long digit strings keep every digit.

```
"-42" -> string/to-int -> io/print-line   ~ -42
```

Errors: `text` is not in that form, reported with its literal form as `cannot convert "abc" to an int`.

## to-float

`text -> string/to-float`

Parses `text` as a float: an optional sign, digits, an optional `.` followed by digits, and an optional exponent such as `e3` or `E-2`. Digits are required on both sides of the point (`".5"` and `"5."` are rejected).

```
"2.5" -> string/to-float -> io/print-line   ~ 2.5
"-1e2" -> string/to-float -> io/print-line  ~ -100.0
```

Errors: `text` is not in that form, reported as `cannot convert "x" to a float`; the number is too large for a float, reported as `"1e400" is too large for a float`. A number too small to represent becomes `0.0`.

## to-string

`text -> string/to-string`

Returns `text` itself. Every scalar module has a `to-string`, so a flow that converts values to text reads the same whatever the module.

```
"abc" -> string/to-string -> io/print-line   ~ abc
```

## from-chars

`chars -> string/from-chars`

Builds a string from an array of chars. This is the one function in the module whose input is not a string: it is the constructor that inverts `string/chars`.

```
[`a` `👍` `b`] -> string/from-chars -> io/print-line   ~ a👍b
```

Errors: the input is not an array, reported as `` the input of `string/from-chars` must be an array, got a string ``; an element is not a char, reported as `` element 1 of the input of `string/from-chars` must be a char, got an int ``.

## each

`text -> string/each c | body`

Calls the body once per char of `text`, in order, with the char as its argument. Returns `nothing`. `stop` ends the loop early and `out` leaves the enclosing procedure, as with `array/each`.

```
"a👍b" -> string/each c
| c = `👍` ? stop
| c -> io/print-line                  ~ a
```

Errors: the body is not a procedure.

## count

`text -> string/count needle`

Returns the number of non-overlapping occurrences of `needle` in `text` as an int, scanning left to right.

```
"banana" -> string/count "an" -> io/print-line  ~ 2
"aaaa" -> string/count "aa" -> io/print-line    ~ 2
```

Errors: `needle` is not a string; `needle` is empty, reported as `` `count` needs a non-empty text to look for ``.
