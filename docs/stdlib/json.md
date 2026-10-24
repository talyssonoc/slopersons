# Json builtins

The `json` module turns JSON text into slopersons values. Like every builtin module it needs no `use`. It is written in slopersons itself (`src/stdlib/json.slop`) rather than TypeScript, so it reads on the order of a few hundred kilobytes a second: fast enough for configuration and data files, slow for large datasets.

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
