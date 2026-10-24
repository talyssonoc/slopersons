# Parse JSON into slopersons values without a reviver

## Status

Accepted

## Context

Programs that keep their state in files need to read JSON. Douglas Crockford's `json2.js` is the model: its `JSON.parse` checks the text with four regular expressions, builds the value with `eval`, and then optionally walks the result with a reviver function that can replace members, or delete them by returning `undefined`. Slopersons has no `eval`, and loading data through the module loader would run the data as a program.

## Decision

- `text -> json/parse` is a recursive-descent parser for RFC 8259 JSON in `src/stdlib/json.slop`, loaded as described in [Write host-independent standard library modules in slopersons](./202610240926-write-host-independent-standard-library-modules-in-slopersons.md).
- Objects become hashmaps with string keys in the order written, where a repeated name keeps its last value. Arrays become arrays and strings become strings. `true`, `false` and `null` become `yes`, `no` and `nothing`.
- A number with no fraction and no exponent becomes an exact int of any size; any other number becomes a float. `-0` becomes `0`. A number too large for a float is an error rather than `Infinity`, which needed `string/to-float` to refuse such numbers as the semantics already required.
- `\u` escapes that form a surrogate pair become one character. Half of a pair on its own is an error, because a slopersons string holds code points. A byte order mark is not whitespace, as in JavaScript.
- Invalid text is a runtime error that gives the offset of the problem in characters from 0, what was expected and what was found: ``invalid JSON at offset 3: expected a value, found `]` ``.
- There is no reviver, and no `json/stringify` yet.

Rejected:

- Porting `json2.js`'s approach of checking the text with patterns and then evaluating it: there is nothing to evaluate it with.
- A reviver: nothing needs one yet, and it would not carry over cleanly, because `json2.js` deletes a member when the reviver returns `undefined`, and slopersons' only absent value, `nothing`, is also what JSON `null` becomes.
- Turning every number into a float, as JavaScript does: integers beyond 2^53 would lose digits, and slopersons has exact ints.

## Consequences

- Objects and arrays nested more than about 4,900 levels deep reach the limit on nested procedure calls, since each level costs two calls.
- Parsing runs at a few hundred kilobytes a second, about 0.8 MB in under two seconds when measured, which suits configuration and data files.
- `show` does not produce JSON, so writing JSON needs a `json/stringify`, left for when a program needs it.
