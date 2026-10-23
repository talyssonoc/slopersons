# Math builtins

Functions that accept either an int or a float as input, so they live in a module of their own instead of being duplicated under `int/` and `float/`. The `math` module is the one place (besides `date/is-leap-year`) where a member dispatches on the type of the piped value: any other receiver stops the program with `` `math/abs` cannot be used with a string; it works on int, float ``. Mixed int and float arguments promote like arithmetic does: the result is a float as soon as a float is involved, while comparisons between an int and a float are exact. No function here ever yields an infinite or undefined number: the cases where a float would overflow or have no value stop the program with an error instead.

## abs

`number -> math/abs`

Returns the magnitude of `number` with the same type as the input.

```
-5 -> math/abs -> io/print-line        ~ 5
-2.5 -> math/abs -> io/print-line      ~ 2.5
```

Errors: the input is not an int or a float.

## pow

`base -> math/pow exponent`

Raises `base` to `exponent`. Two ints with an exponent of zero or more give an exact int. A negative int exponent or any float operand gives a float.

```
2 -> math/pow 10 -> io/print-line      ~ 1024
2 -> math/pow -1 -> io/print-line      ~ 0.5
9 -> math/pow 0.5 -> io/print-line     ~ 3.0
2.0 -> math/pow 3 -> io/print-line     ~ 8.0
```

Errors: the input is not an int or a float; the exponent is not an int or a float; the result is too large for an int or a float; zero raised to a negative exponent; a negative base with a fractional exponent.

## sqrt

`number -> math/sqrt`

Returns the square root as a float, whatever the type of the input.

```
16 -> math/sqrt -> io/print-line       ~ 4.0
2.25 -> math/sqrt -> io/print-line     ~ 1.5
```

Errors: the input is not an int or a float; the input is negative; the input is an int too large for a float.

## min

`number -> math/min other`

Returns the smaller of the two numbers, unchanged: an int stays an int and a float stays a float. On a tie the input wins. Arrays have their own one-argument `array/min`: see the [array page](array.md).

```
3 -> math/min 2.5 -> io/print-line     ~ 2.5
3 -> math/min 4 -> io/print-line       ~ 3
1 -> math/min 1.0 -> io/print-line     ~ 1
```

Errors: the input is not an int or a float; `other` is not an int or a float.

## max

`number -> math/max other`

Returns the larger of the two numbers, unchanged. On a tie the input wins. Arrays have their own one-argument `array/max`: see the [array page](array.md).

```
2.5 -> math/max 3 -> io/print-line     ~ 3
1.0 -> math/max 1 -> io/print-line     ~ 1.0
```

Errors: the input is not an int or a float; `other` is not an int or a float.

## clamp

`number -> math/clamp low high`

Returns `low` when `number` is below it, `high` when `number` is above it, otherwise `number` itself. Whichever operand is returned keeps its own type.

```
5 -> math/clamp 1 3 -> io/print-line    ~ 3
-5 -> math/clamp 1 3 -> io/print-line   ~ 1
2 -> math/clamp 2.5 4 -> io/print-line  ~ 2.5
```

Errors: the input is not an int or a float; a bound is not an int or a float; `low` is greater than `high`.

## sign

`number -> math/sign`

Returns the int `-1`, `0` or `1` according to whether `number` is negative, zero or positive.

```
-7 -> math/sign -> io/print-line       ~ -1
0.0 -> math/sign -> io/print-line      ~ 0
3.5 -> math/sign -> io/print-line      ~ 1
```

Errors: the input is not an int or a float.

