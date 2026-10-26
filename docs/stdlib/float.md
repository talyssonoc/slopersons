# Float builtins

Builtins whose input is a float. The numeric functions that accept an int as well (`abs`, `pow`, `sqrt`, `min`, `max`, `clamp`, `sign`) live in the [math module](math.md). Any other receiver stops the program with `` the input of `float/round` must be a float, got an int ``. The conversions to int below need a finite float: arithmetic can overflow a float past its range, and converting such a value is an error rather than a wrong int.

## round

`float -> float/round`

Returns the nearest int. Halves round away from zero on both sides: `2.5` becomes `3` and `-2.5` becomes `-3`.

```
2.5 -> float/round -> io/print-line    ~ 3
-2.5 -> float/round -> io/print-line   ~ -3
2.4 -> float/round -> io/print-line    ~ 2
```

Errors: the input is not a float; the input is not a finite float.

## floor

`float -> float/floor`

Returns the largest int that is not greater than the input.

```
2.7 -> float/floor -> io/print-line    ~ 2
-2.3 -> float/floor -> io/print-line   ~ -3
```

Errors: the input is not a float; the input is not a finite float.

## ceil

`float -> float/ceil`

Returns the smallest int that is not less than the input.

```
2.1 -> float/ceil -> io/print-line     ~ 3
-2.7 -> float/ceil -> io/print-line    ~ -2
```

Errors: the input is not a float; the input is not a finite float.

## to-int

`float -> float/to-int`

Returns the int part of the float, dropping the fraction toward zero: `-2.9` becomes `-2`. Use `float/round`, `float/floor` or `float/ceil` for the other roundings.

```
2.9 -> float/to-int -> io/print-line   ~ 2
-2.9 -> float/to-int -> io/print-line  ~ -2
```

Errors: the input is not a float; the input is not a finite float.

## is-integer

`float -> float/is-integer`

Returns `yes` when the float has no fractional part.

```
2.0 -> float/is-integer -> io/print-line ~ yes
2.5 -> float/is-integer -> io/print-line ~ no
```

Errors: the input is not a float.

## to-string

`float -> float/to-string`

Returns the float as `io/print-line` shows it: a float always keeps a decimal point. Ints have `int/to-string`.

```
2.0 -> float/to-string -> show -> io/print-line   ~ "2.0"
```

## random

`float/random -> do`

Returns a float from 0.0 up to, but not including, 1.0, a multiple of 2^-53 with every one as likely as the others. It takes no input, so it is called through `do`. Random values come from a cryptographically secure generator, the kind used for encryption keys, so they are fit for session ids and tokens. There is no seed: a program cannot replay the same values, so code that depends on chance is tested by passing the chosen value in rather than drawing it inside. For a whole number in a range, `int/random` is exact where scaling a float is not.

```
float/random -> do -> io/print-line       ~ 0.7316412875011468
(float/random -> do) < 0.25 ? "a one-in-four chance" -> io/print-line
```
