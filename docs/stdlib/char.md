# Char builtins

Builtins whose input is a char. A char is one Unicode code point, so `char/to-int` and `int/to-char` round-trip through any code point, including those outside the basic plane such as `` `👍` ``. Classification uses the Unicode categories: letters are `\p{L}`, digits are `\p{Nd}` (so `` `٣` `` is a digit), and spaces are the Unicode white space characters. Any other receiver stops the program with `` the input of `char/upper` must be a char, got a string ``.

## to-int

`char -> char/to-int`

Returns the code point of the char as an int. The int page has `int/to-char` for the way back.

```
`a` -> char/to-int -> io/print-ln      ~ 97
`👍` -> char/to-int -> io/print-ln     ~ 128077
```

Errors: the input is not a char.

## upper

`char -> char/upper`

Returns the upper-case form of the char. When the upper-case form is more than one code point, as `` `ß` `` becoming `SS`, the char is returned unchanged, since a char cannot hold two code points. Strings have their own `string/upper`: see the [string page](string.md).

```
`a` -> char/upper -> io/print-ln       ~ A
`ß` -> char/upper -> io/print-ln       ~ ß
```

Errors: the input is not a char.

## lower

`char -> char/lower`

Returns the lower-case form of the char. As with `char/upper`, a mapping to more than one code point leaves the char unchanged. Strings have their own `string/lower`: see the [string page](string.md).

```
`Z` -> char/lower -> io/print-ln       ~ z
```

Errors: the input is not a char.

## is-letter

`char -> char/is-letter`

Returns `yes` when the char is a letter in any script.

```
`é` -> char/is-letter -> io/print-ln   ~ yes
`1` -> char/is-letter -> io/print-ln   ~ no
```

Errors: the input is not a char.

## is-digit

`char -> char/is-digit`

Returns `yes` when the char is a decimal digit in any script. Other numeric characters such as `` `½` `` are not digits.

```
`7` -> char/is-digit -> io/print-ln    ~ yes
`½` -> char/is-digit -> io/print-ln    ~ no
```

Errors: the input is not a char.

## is-space

`char -> char/is-space`

Returns `yes` when the char is white space, including tabs and line breaks.

```
`\t` -> char/is-space -> io/print-ln   ~ yes
`a` -> char/is-space -> io/print-ln    ~ no
```

Errors: the input is not a char.

## to-string

`char -> char/to-string`

Returns a string holding just this char.

```
`a` -> char/to-string -> show -> io/print-ln   ~ "a"
```

Errors: the input is not a char.

