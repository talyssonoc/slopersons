# Boolean builtins

Builtins whose input is a boolean, `yes` or `no`. Booleans do not coerce anywhere else in the language, so these two conversions are the only way to turn one into another type. Any other receiver stops the program with `` the input of `boolean/to-int` must be a boolean, got an int ``.

## to-string

`boolean -> boolean/to-string`

Returns `"yes"` or `"no"`.

```
yes -> boolean/to-string -> show -> io/print-line   ~ "yes"
```

Errors: the input is not a boolean.

## to-int

`boolean -> boolean/to-int`

Returns `1` for `yes` and `0` for `no`, which makes counting matches a sum.

```
(3 > 2) -> boolean/to-int -> io/print-line        ~ 1
no -> boolean/to-int -> io/print-line             ~ 0
```

Errors: the input is not a boolean.

