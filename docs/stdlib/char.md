# Char builtins

Builtins whose input is a char. A char is one Unicode code point, so `to-int` and `to-char` round-trip through any code point, including those outside the basic plane such as `` `👍` ``. Classification uses the Unicode categories: letters are `\p{L}`, digits are `\p{Nd}` (so `` `٣` `` is a digit), and spaces are the Unicode white space characters.

## to-int

`char -> to-int`

Returns the code point of the char as an int. The int page has `to-char` for the way back.

```
`a` -> to-int -> print-ln     ~ 97
`👍` -> to-int -> print-ln    ~ 128077
```

## upper

`char -> upper`

Returns the upper-case form of the char. When the upper-case form is more than one code point, as `` `ß` `` becoming `SS`, the char is returned unchanged, since a char cannot hold two code points. Strings have their own `upper`: see the string page.

```
`a` -> upper -> print-ln      ~ A
`ß` -> upper -> print-ln      ~ ß
```

## lower

`char -> lower`

Returns the lower-case form of the char. As with `upper`, a mapping to more than one code point leaves the char unchanged. Strings have their own `lower`: see the string page.

```
`Z` -> lower -> print-ln      ~ z
```

## is-letter

`char -> is-letter`

Returns `yes` when the char is a letter in any script.

```
`é` -> is-letter -> print-ln  ~ yes
`1` -> is-letter -> print-ln  ~ no
```

## is-digit

`char -> is-digit`

Returns `yes` when the char is a decimal digit in any script. Other numeric characters such as `` `½` `` are not digits.

```
`7` -> is-digit -> print-ln   ~ yes
`½` -> is-digit -> print-ln   ~ no
```

## is-space

`char -> is-space`

Returns `yes` when the char is white space, including tabs and line breaks.

```
`\t` -> is-space -> print-ln  ~ yes
`a` -> is-space -> print-ln   ~ no
```

## to-string

`char -> to-string`

Returns a string holding just this char.

```
`a` -> to-string -> show -> print-ln   ~ "a"
```
