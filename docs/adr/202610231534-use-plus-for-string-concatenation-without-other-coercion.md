# Use `+` for string concatenation and coerce nothing else

## Status

Accepted

## Context

With interpolation available, concatenation is rare, and a dedicated operator would be one more glyph to learn.

## Decision

`+` on two strings concatenates them. Mixing a string with any other type in an arithmetic operator is an error; no value is ever converted implicitly.

Rejected: a dedicated concatenation operator such as `++`, `&` or `..`; implicit conversion of numbers to strings.

## Consequences

- `"a" + 1` is an error rather than `"a1"`; the program converts with `-> to-string` or uses interpolation.
