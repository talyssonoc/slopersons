# Float builtins

Builtins whose input is a float. `abs`, `pow`, `sqrt`, `min`, `max`, `clamp`, `sign` and `to-string` accept floats too and are documented on the [int page](int.md). The conversions to int below need a finite float: arithmetic can overflow a float past its range, and converting such a value is an error rather than a wrong int.

## round

`float -> round`

Returns the nearest int. Halves round away from zero on both sides: `2.5` becomes `3` and `-2.5` becomes `-3`.

```
2.5 -> round -> print      ~ 3
-2.5 -> round -> print     ~ -3
2.4 -> round -> print      ~ 2
```

Errors: the input is not a finite float.

## floor

`float -> floor`

Returns the largest int that is not greater than the input.

```
2.7 -> floor -> print      ~ 2
-2.3 -> floor -> print     ~ -3
```

Errors: the input is not a finite float.

## ceil

`float -> ceil`

Returns the smallest int that is not less than the input.

```
2.1 -> ceil -> print       ~ 3
-2.7 -> ceil -> print      ~ -2
```

Errors: the input is not a finite float.

## to-int

`float -> to-int`

Returns the int part of the float, dropping the fraction toward zero: `-2.9` becomes `-2`. Use `round`, `floor` or `ceil` for the other roundings.

```
2.9 -> to-int -> print     ~ 2
-2.9 -> to-int -> print    ~ -2
```

Errors: the input is not a finite float.

## is-integer

`float -> is-integer`

Returns `yes` when the float has no fractional part.

```
2.0 -> is-integer -> print ~ yes
2.5 -> is-integer -> print ~ no
```
