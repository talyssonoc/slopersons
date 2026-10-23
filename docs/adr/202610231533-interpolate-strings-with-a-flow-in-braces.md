# Interpolate strings with a flow in braces

## Status

Accepted

## Context

Building output by concatenation is verbose, and the language has no formatting function.

## Decision

Inside a string, `{...}` holds any flow and is replaced by its value in print form: `"total: {total}"`, `"{x -> double}!"`. `\{` and `\}` are literal braces.

Rejected: concatenation only; sigil interpolation such as `$name`, which cannot hold a flow.

## Consequences

- Most output needs no string concatenation at all.
- The lexer tokenizes the contents of braces recursively, including nested strings.
