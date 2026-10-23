# Make `out` exit the nearest enclosing `proc`

## Status

Accepted

## Context

With lambdas passed to `each` and other builtins, an early exit written inside a lambda has to choose between leaving the lambda and leaving the procedure around it.

## Decision

`value -> out` ends the nearest enclosing `proc` call, through lambdas, like Ruby's `return` inside a block, so `each n | n = 3 ? n -> out` leaves the procedure. The target is fixed when the lambda is created; reaching `out` from a lambda whose procedure has already returned is an error, as is `out` at the top level. `stop` leaves only the innermost loop.

Rejected: `out` leaving only the innermost lambda, which would make `find`-style procedures awkward.

## Consequences

- Each `proc` call has an activation identifier that `out` targets.
- A stored lambda may fail at run time if it uses `out` after its procedure returned.
