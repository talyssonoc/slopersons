# Read a line of bare names followed by a block as a lambda

## Status

Accepted

## Context

Procedures that return lambdas need a way to write a multi-line lambda as a statement, as in `proc adder k` with the body `n` and a nested block `n + k`.

## Decision

A line whose tokens are only names, followed by a margin block, is a lambda with those names as parameters and the block as its body. A literal followed by a block is an error.

## Consequences

- `n` on its own line followed by `| n + k` is the same lambda as `n | n + k`.
- A bare name on its own line without a block is still a value lookup.
