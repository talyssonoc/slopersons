# Int builtins

Builtins whose input is an int. The ones marked `(int, float)` accept a float input as well and are documented here once; the [float page](float.md) lists only what is specific to floats. Mixed int and float arguments promote like arithmetic does: the result is a float as soon as a float is involved, while comparisons between an int and a float are exact. No builtin here ever yields an infinite or undefined number: the cases where a float would overflow or have no value stop the program with an error instead.

## abs

`number -> abs` (int, float)

Returns the magnitude of `number` with the same type as the input.

```
-5 -> abs -> print-ln         ~ 5
-2.5 -> abs -> print-ln       ~ 2.5
```

## pow

`base -> pow exponent` (int, float)

Raises `base` to `exponent`. Two ints with an exponent of zero or more give an exact int. A negative int exponent or any float operand gives a float.

```
2 -> pow 10 -> print-ln       ~ 1024
2 -> pow -1 -> print-ln       ~ 0.5
9 -> pow 0.5 -> print-ln      ~ 3.0
2.0 -> pow 3 -> print-ln      ~ 8.0
```

Errors: the exponent is not an int or a float; the result is too large for an int or a float; zero raised to a negative exponent; a negative base with a fractional exponent.

## sqrt

`number -> sqrt` (int, float)

Returns the square root as a float, whatever the type of the input.

```
16 -> sqrt -> print-ln        ~ 4.0
2.25 -> sqrt -> print-ln      ~ 1.5
```

Errors: the input is negative; the input is an int too large for a float.

## min

`number -> min other` (int, float)

Returns the smaller of the two numbers, unchanged: an int stays an int and a float stays a float. On a tie the input wins. Arrays have their own one-argument `min`: see the array page.

```
3 -> min 2.5 -> print-ln      ~ 2.5
3 -> min 4 -> print-ln        ~ 3
1 -> min 1.0 -> print-ln      ~ 1
```

Errors: `other` is not an int or a float.

## max

`number -> max other` (int, float)

Returns the larger of the two numbers, unchanged. On a tie the input wins. Arrays have their own one-argument `max`: see the array page.

```
2.5 -> max 3 -> print-ln      ~ 3
1.0 -> max 1 -> print-ln      ~ 1.0
```

Errors: `other` is not an int or a float.

## clamp

`number -> clamp low high` (int, float)

Returns `low` when `number` is below it, `high` when `number` is above it, otherwise `number` itself. Whichever operand is returned keeps its own type.

```
5 -> clamp 1 3 -> print-ln    ~ 3
-5 -> clamp 1 3 -> print-ln   ~ 1
2 -> clamp 2.5 4 -> print-ln  ~ 2.5
```

Errors: a bound is not an int or a float; `low` is greater than `high`.

## sign

`number -> sign` (int, float)

Returns the int `-1`, `0` or `1` according to whether `number` is negative, zero or positive.

```
-7 -> sign -> print-ln        ~ -1
0.0 -> sign -> print-ln       ~ 0
3.5 -> sign -> print-ln       ~ 1
```

## is-even

`int -> is-even`

Returns `yes` when the int is divisible by two. Zero is even.

```
4 -> is-even -> print-ln      ~ yes
-3 -> is-even -> print-ln     ~ no
```

Errors: the input is not an int.

## is-odd

`int -> is-odd`

Returns `yes` when the int is not divisible by two.

```
-3 -> is-odd -> print-ln      ~ yes
```

Errors: the input is not an int.

## to-float

`int -> to-float`

Returns the int as a float. Ints above 2^53 in magnitude lose precision in the conversion.

```
3 -> to-float -> print-ln     ~ 3.0
```

Errors: the input is too large for a float.

## to-int

`int -> to-int`

Returns the int unchanged. Floats, chars and booleans have their own `to-int`: see their pages.

```
42 -> to-int -> print-ln      ~ 42
```

## to-char

`int -> to-char`

Returns the char with this Unicode code point.

```
97 -> to-char -> print-ln     ~ a
128077 -> to-char -> print-ln ~ 👍
```

Errors: the input is not between 0 and 1114111; the input is a surrogate code point (55296 to 57343).

## to-string

`number -> to-string` (int, float)

Returns the number as `print-ln` shows it. Floats always keep a decimal point. Chars and booleans have their own `to-string`: see their pages.

```
42 -> to-string -> show -> print-ln    ~ "42"
2.0 -> to-string -> show -> print-ln   ~ "2.0"
```
