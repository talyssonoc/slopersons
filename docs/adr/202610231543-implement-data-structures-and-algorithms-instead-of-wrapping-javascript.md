# Implement data structures and algorithms instead of wrapping JavaScript

## Status

Accepted

## Context

The interpreter is meant to implement the language itself rather than proxy the Node runtime: the language's data structures and algorithms should be its own code, not JavaScript's under another name. The line had to be drawn somewhere, since the interpreter cannot avoid JavaScript numbers and I/O.

## Decision

Data structures and algorithms are implemented in the interpreter: the hash table (a compact ordered dict with open addressing), stable merge sort, string search, split, trim and padding over code points, and proleptic Gregorian calendar arithmetic. JavaScript supplies only number and BigInt arithmetic, code point access and `String.fromCodePoint`, per-code-point case mapping and the `\p{L}`, `\p{Nd}` and `\s` classification tables, the clock through `Date.now()`, and I/O. JS `Date` and `Array.prototype.sort` may be oracles in tests, never in `src/`.

Rejected:

- Reusing `Map`, `Set`, `Array.prototype.sort` and `Temporal` internally: faster to build, but the interpreter would be a wrapper.
- Shipping our own Unicode tables: large effort for no language value.

## Consequences

- `src/runtime/` holds the hand-built pieces, and `test/no-proxy.test.ts` fails on new uses of the forbidden APIs.
- Some operations are slower than their JavaScript counterparts.
