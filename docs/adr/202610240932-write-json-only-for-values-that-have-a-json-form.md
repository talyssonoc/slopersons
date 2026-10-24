# Write JSON only for values that have a JSON form

## Status

Accepted

## Context

`json/parse` reads program state from files. Storing that state needs the other half, `json/stringify`. Slopersons has values with no JSON counterpart (chars, dates, times, datetimes, sets, procedures, modules, streams, errors), hashmaps whose keys can be any value, ints of any size, floats whose printed form always has a decimal point, and mutable arrays and hashmaps that can contain themselves. JavaScript's `JSON.stringify` converts or drops what it cannot represent: a `Date` becomes its ISO string, a `Set` becomes `{}`, functions disappear, and a structure that contains itself raises an error.

## Decision

- `value -> json/stringify` returns compact JSON with no spaces or line breaks. It lives in `src/stdlib/json.slop` beside `parse`.
- Strings are escaped exactly as `JSON.stringify` escapes them: `"` and `\`, control characters as `\b`, `\t`, `\n`, `\f`, `\r` or lowercase `\u00XX`, and every other character as it is.
- Ints are written with every digit. Floats are written in their printed form, which always has a decimal point (`2.0`, `-0.0`, `1.0e+21`), so `json/parse` reads them back as floats.
- A value with no JSON form is an error, and so is a hashmap key that is not a string. The message names the type and locates the value with a JSON Pointer (RFC 6901): `` `json/stringify` cannot write a date as JSON (at /items/1/when) ``.
- Nesting is limited to 1000 levels. That limit is also how a value that contains itself is caught: `` `json/stringify` stopped after 1000 levels of nesting; the value is nested too deeply or contains itself ``.
- There is no replacer and no indentation argument.

Rejected:

- Converting values the way JavaScript does (a date to a string, a char to a one-character string, a set to an array): `json/parse` would give back a different type, and the program that saved state would not notice until it read it.
- Converting non-string keys to their printed form: `{1: "x"}` would come back as `{"1": "x"}`, a different hashmap.
- Detecting a value that contains itself exactly: slopersons has no way to ask whether two arrays are the same array, because `=` compares structure and would itself loop forever on such a value. Adding an identity builtin for this one function was not worth the new surface.
- Relying on the limit of 10000 nested procedure calls instead of a nesting limit: the message would say nothing about the value.
- Writing a float with no fraction as `2`, as JavaScript does: it would read back as an int.
- An optional indentation argument: user procedures have exact arity, so it would need a second member, such as `json/stringify-indented`, which can be added when a program needs readable output.

## Consequences

- `text -> json/parse -> json/stringify` gives back `JSON.stringify`'s output for any document without floats; the tests check this on random documents.
- Programs convert dates, chars and sets themselves before writing, and back after reading.
- A value nested more than 1000 levels deep cannot be written even when it does not contain itself, although `json/parse` reads up to about 4,900 levels.
