# Make `stop` a keyword statement

## Status

Accepted

## Context

A bare name is a value lookup, so a builtin named `stop` written alone on a line would never be called.

## Decision

`stop` is a statement keyword that leaves the innermost `while`, `each` or `repeat`. `out` stays a builtin because it always has an input to flow into it (`value -> out`); exiting with no value is `nothing -> out`.

## Consequences

- `stop` is reserved and cannot take a block or arguments.
- Loop builtins catch the stop signal; a `stop` whose loop is in a calling procedure is an error.
