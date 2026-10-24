# Json builtins

The `json` module reads JSON text into slopersons values and writes values back as JSON text. Like every builtin module it needs no `use`. It is written in slopersons itself (`src/stdlib/json.slop`) rather than TypeScript, so it reads on the order of a few hundred kilobytes a second: fast enough for configuration and data files, slow for large datasets.

## parse

`text -> json/parse`

Parses `text` as one JSON value, following RFC 8259, and returns it as a slopersons value:

| JSON | slopersons |
| --- | --- |
| object | hashmap with string keys, in the order the members appear; a repeated name keeps its last value |
| array | array |
| string | string |
| number with no fraction and no exponent | int, exact at any size |
| number with a fraction or an exponent | float |
| `true`, `false` | `yes`, `no` |
| `null` | `nothing` |

Spaces, tabs and line breaks may surround any token. The text must hold exactly one value; anything after it other than whitespace is an error.

```
"[1, 2.5, \"three\", true, null]" -> json/parse -> io/print-line   ~ [1 2.5 "three" yes nothing]
"\{\"theme\": \"dark\"\}" -> json/parse -> hashmap/at "theme" -> io/print-line   ~ dark
"settings.json" -> file/read -> json/parse => settings
```

In a string literal, the braces of a JSON object are written `\{` and `\}`, because a bare brace starts an interpolation. Text read from a file or from standard input needs no escaping.

Errors, all runtime errors that `attempt` can handle:

- the input is not a string: `` the input of `json/parse` must be a string, got an int ``;
- the text is not valid JSON. The message gives the offset of the problem, counting characters from 0, what was expected and what was found: ``invalid JSON at offset 3: expected a value, found `]` ``;
- a number is too large for a float: `invalid JSON at offset 0: the number 1e400 is too large for a float`;
- a `\u` escape holds half of a surrogate pair without the other half, which a slopersons string, made of whole code points, cannot hold;
- arrays and objects are nested more than about 4,900 levels deep, which reaches the limit on nested procedure calls.

Compared with JavaScript's `JSON.parse`: integers stay exact instead of becoming 64-bit floats, `-0` becomes `0`, member order is kept exactly as written, `1e400` is an error instead of `Infinity`, a lone surrogate escape is an error, and there is no reviver argument.

## stringify

`value -> json/stringify`

Returns `value` written as compact JSON text, with no spaces or line breaks. It is the reverse of `json/parse`:

| slopersons | JSON |
| --- | --- |
| hashmap with string keys | object, with the members in the hashmap's order |
| array | array |
| string | string: `"` and `\` are escaped, control characters become `\b`, `\t`, `\n`, `\f`, `\r` or `\u00XX`, and every other character is written as it is |
| int | number, with every digit |
| float | number, always with a decimal point (`2.0`, `1.0e+21`), so `json/parse` reads it back as a float |
| `yes`, `no` | `true`, `false` |
| `nothing` | `null` |

```
{"name": "Ada"  "langs": ["slop"]  "score": 2.0  "ok": yes} -> json/stringify -> io/print-line   ~ {"name":"Ada","langs":["slop"],"score":2.0,"ok":true}
"settings.json" -> file/write (settings -> json/stringify)
```

Errors, all runtime errors that `attempt` can handle:

- a value JSON has no form for: a char, date, time, datetime, set, procedure, module, stream or error. Convert it first, for example with `char/to-string` or `date/format`. The message locates the value as a JSON Pointer: `` `json/stringify` cannot write a date as JSON (at /items/1/when) ``;
- a hashmap key that is not a string: `` `json/stringify` needs string keys to write an object, but found an int key (at /scores) ``;
- nesting deeper than 1000 levels, which is also how a value that contains itself shows up: `` `json/stringify` stopped after 1000 levels of nesting; the value is nested too deeply or contains itself ``.

Compared with JavaScript's `JSON.stringify`: floats keep their decimal point (`2.0` where JavaScript writes `2`); values with no JSON form are errors, where JavaScript turns dates into strings, sets into `{}` and drops functions; and there is no replacer or indentation argument.
