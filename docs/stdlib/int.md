# Int builtins

Builtins whose input is an int. The numeric functions that accept a float as well (`abs`, `pow`, `sqrt`, `min`, `max`, `clamp`, `sign`) live in the [math module](math.md); the range builder `int/up-to` and the counted loop `int/times` are described with the control flow on the [core page](core.md). Any other receiver stops the program with `` the input of `int/is-even` must be an int, got a string ``.

## is-even

`int -> int/is-even`

Returns `yes` when the int is divisible by two. Zero is even.

```
4 -> int/is-even -> io/print-line      ~ yes
-3 -> int/is-even -> io/print-line     ~ no
```

Errors: the input is not an int.

## is-odd

`int -> int/is-odd`

Returns `yes` when the int is not divisible by two.

```
-3 -> int/is-odd -> io/print-line        ~ yes
```

Errors: the input is not an int.

## to-float

`int -> int/to-float`

Returns the int as a float. Ints above 2^53 in magnitude lose precision in the conversion.

```
3 -> int/to-float -> io/print-line       ~ 3.0
```

Errors: the input is too large for a float.

## to-int

`int -> int/to-int`

Returns the int unchanged. Floats, chars and booleans have their own conversion: `float/to-int`, `char/to-int` and `boolean/to-int`.

```
42 -> int/to-int -> io/print-line        ~ 42
```

Errors: the input is not an int.

## to-char

`int -> int/to-char`

Returns the char with this Unicode code point. `char/to-int` is the way back.

```
97 -> int/to-char -> io/print-line      ~ a
128077 -> int/to-char -> io/print-line  ~ 👍
```

Errors: the input is not an int; the input is not between 0 and 1114111; the input is a surrogate code point (55296 to 57343).

## to-string

`int -> int/to-string`

Returns the int as `io/print-line` shows it. Floats, chars and booleans have their own conversion: `float/to-string`, `char/to-string` and `boolean/to-string`.

```
42 -> int/to-string -> show -> io/print-line    ~ "42"
```

## up-to

`from -> int/up-to until`

Builds an array of ints from `from` to `until` inclusive. An empty array when `until` is less than `from`.

```
1 -> int/up-to 4 -> io/print-line   ~ [1 2 3 4]
```

Errors: either bound is not an int; the range would exceed the size limit.

## times

`count -> int/times | body` or `count -> int/times i | body`

Runs the body `count` times. With one parameter the lambda receives the iteration index starting at 0. `stop` ends the loop early. Returns `nothing`.

```
2 -> int/times | "x" -> io/print
"" -> io/print-line                   ~ xx
```

Errors: the count is not an int; the body is not a procedure.
