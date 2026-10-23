# Boolean builtins

Builtins whose input is a boolean, `yes` or `no`. Booleans do not coerce anywhere else in the language, so these two conversions are the only way to turn one into another type.

## to-string

`boolean -> to-string`

Returns `"yes"` or `"no"`.

```
yes -> to-string -> show -> print-ln   ~ "yes"
```

## to-int

`boolean -> to-int`

Returns `1` for `yes` and `0` for `no`, which makes counting matches a sum.

```
(3 > 2) -> to-int -> print-ln          ~ 1
no -> to-int -> print-ln               ~ 0
```
