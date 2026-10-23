# String builtins

Strings are immutable: every operation here returns a new string and leaves its input untouched. Positions, lengths and widths count code points, not UTF-16 units, so `"a👍b"` has length 3 and `👍` sits at index 1. Names marked *shared* also exist for other types (see their pages); the string version is chosen when a string flows in. Type errors follow the convention from the core page: `the input of \`trim\` must be a string, got an int`.

## length

`text -> length` (shared)

Returns the number of code points in `text` as an int.

```
"a👍b" -> length -> print-ln   ~ 3
```

## chars

`text -> chars`

Returns an array with one char per code point of `text`.

```
"a👍b" -> chars -> print-ln    ~ [`a` `👍` `b`]
```

## at

`text -> at index` (shared)

Returns the char at code point position `index`, counting from 0.

```
"a👍b" -> at 1 -> print-ln     ~ 👍
```

Errors: `index` is not an int; `index` is outside `0` to `length - 1`, reported as `index 5 is out of range for a string of length 3`.

## slice

`text -> slice start end` (shared)

Returns the code points from `start` (inclusive) to `end` (exclusive). Both bounds are clamped into the string, so an `end` past the length is not an error, and `start >= end` yields `""`.

```
"a👍bc" -> slice 1 3 -> print-ln   ~ 👍b
"abc" -> slice 1 10 -> print-ln    ~ bc
```

Errors: `start` or `end` is not an int.

## upper

`text -> upper` (shared)

Returns `text` with every code point in upper case.

```
"héllo" -> upper -> print-ln   ~ HÉLLO
```

## lower

`text -> lower` (shared)

Returns `text` with every code point in lower case.

```
"HÉLLO" -> lower -> print-ln   ~ héllo
```

## trim

`text -> trim`

Returns `text` without leading and trailing whitespace (spaces, tabs, line breaks and other Unicode spaces).

```
"  a b \n" -> trim -> show -> print-ln   ~ "a b"
```

## trim-start

`text -> trim-start`

Returns `text` without leading whitespace.

```
"  a  " -> trim-start -> show -> print-ln   ~ "a  "
```

## trim-end

`text -> trim-end`

Returns `text` without trailing whitespace.

```
"  a  " -> trim-end -> show -> print-ln   ~ "  a"
```

## split

`text -> split separator`

Returns the array of pieces between occurrences of `separator`. Adjacent separators produce empty strings, and an empty `text` gives `[""]`. An empty `separator` splits into one-code-point strings.

```
"a,b,,c" -> split "," -> print-ln   ~ ["a" "b" "" "c"]
"a👍b" -> split "" -> print-ln       ~ ["a" "👍" "b"]
```

Errors: `separator` is not a string.

## contains

`text -> contains needle` (shared)

Returns `yes` when `needle` occurs in `text`.

```
"a👍b" -> contains "👍b" -> print-ln   ~ yes
```

Errors: `needle` is not a string.

## starts-with

`text -> starts-with prefix`

Returns `yes` when `text` begins with `prefix`.

```
"hello" -> starts-with "he" -> print-ln   ~ yes
```

Errors: `prefix` is not a string.

## ends-with

`text -> ends-with suffix`

Returns `yes` when `text` ends with `suffix`.

```
"ab👍" -> ends-with "b👍" -> print-ln   ~ yes
```

Errors: `suffix` is not a string.

## index-of

`text -> index-of needle` (shared)

Returns the code point index of the first occurrence of `needle` as an int, or `nothing` when `needle` does not occur. This is one of the few builtins whose result can be `nothing`; compare with `= nothing` before using the index.

```
"ab👍cd" -> index-of "cd" -> print-ln   ~ 3
"abc" -> index-of "z" -> print-ln       ~ nothing
```

Errors: `needle` is not a string.

## replace

`text -> replace old new`

Returns `text` with every non-overlapping occurrence of `old` replaced by `new`, scanning left to right.

```
"banana" -> replace "an" "AN" -> print-ln   ~ bANANa
"aaa" -> replace "aa" "b" -> print-ln       ~ ba
```

Errors: `old` or `new` is not a string; `old` is empty, reported as `` `replace` needs a non-empty text to look for ``.

## repeat

`text -> repeat count` (shared)

Returns `count` copies of `text` joined together. `0` gives `""`. With an int on the left, `repeat` is the loop from the core page instead.

```
"👍a" -> repeat 2 -> print-ln   ~ 👍a👍a
```

Errors: `count` is not an int; `count` is negative.

## reverse

`text -> reverse` (shared)

Returns the code points of `text` in reverse order.

```
"a👍b" -> reverse -> print-ln   ~ b👍a
```

## pad-left

`text -> pad-left width fill`

Returns `text` preceded by as many `fill` chars as needed to reach `width` code points. A `text` already at least `width` long comes back unchanged.

```
"7" -> pad-left 3 `0` -> print-ln    ~ 007
"👍" -> pad-left 3 `.` -> print-ln   ~ ..👍
```

Errors: `width` is not an int; `fill` is not a char.

## pad-right

`text -> pad-right width fill`

Returns `text` followed by as many `fill` chars as needed to reach `width` code points. A `text` already at least `width` long comes back unchanged.

```
"ab" -> pad-right 4 `.` -> print-ln   ~ ab..
```

Errors: `width` is not an int; `fill` is not a char.

## lines

`text -> lines`

Returns the array of lines in `text`, split at `\n`. A `\r` before a line break is dropped, and a trailing line break does not produce an empty last line.

```
"a\r\nb\n" -> lines -> print-ln   ~ ["a" "b"]
```

## words

`text -> words`

Returns the array of maximal runs of non-whitespace in `text`. Leading, trailing and repeated whitespace produce no empty strings.

```
"  one two\tthree  " -> words -> print-ln   ~ ["one" "two" "three"]
```

## is-empty

`text -> is-empty` (shared)

Returns `yes` when `text` has no code points.

```
"" -> is-empty -> print-ln    ~ yes
" " -> is-empty -> print-ln   ~ no
```

## to-int

`text -> to-int` (shared)

Parses `text` as an int: an optional `+` or `-` followed by one or more decimal digits, with nothing else around them. Ints are arbitrary precision, so long digit strings keep every digit.

```
"-42" -> to-int -> print-ln   ~ -42
```

Errors: `text` is not in that form, reported with its literal form as `cannot convert "abc" to an int`.

## to-float

`text -> to-float` (shared)

Parses `text` as a float: an optional sign, digits, an optional `.` followed by digits, and an optional exponent such as `e3` or `E-2`. Digits are required on both sides of the point (`".5"` and `"5."` are rejected).

```
"2.5" -> to-float -> print-ln    ~ 2.5
"-1e2" -> to-float -> print-ln   ~ -100.0
```

Errors: `text` is not in that form, reported as `cannot convert "x" to a float`.

## to-string

`text -> to-string` (shared)

Returns `text` itself. It exists so a flow can call `to-string` without checking whether the value is already a string.

```
"abc" -> to-string -> print-ln   ~ abc
```

## from-chars

`chars -> from-chars`

Joins an array of chars into a string. The receiver is an array, so this is the inverse of `chars`.

```
[`a` `👍` `b`] -> from-chars -> print-ln   ~ a👍b
```

Errors: the input is not an array; an element is not a char, reported as `` element 1 of the input of `from-chars` must be a char, got an int ``.

## each

`text -> each c | body` (shared)

Calls the body once per code point, in order, with the code point as a char. Returns `nothing`. `stop` ends the loop early and `out` leaves the enclosing procedure, as with arrays.

```
"a👍b" -> each c
| c = `👍` ? stop
| c -> print-ln                  ~ a
```

Errors: the body is not a procedure.

## count

`text -> count needle`

Returns the number of non-overlapping occurrences of `needle` in `text` as an int, scanning left to right.

```
"banana" -> count "an" -> print-ln   ~ 2
"aaaa" -> count "aa" -> print-ln     ~ 2
```

Errors: `needle` is not a string; `needle` is empty, reported as `` `count` needs a non-empty text to look for ``.
