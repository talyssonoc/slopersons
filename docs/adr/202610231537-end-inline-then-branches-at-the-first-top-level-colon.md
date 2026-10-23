# End inline then-branches at the first top-level colon

## Status

Accepted

## Context

`cond ? then : else` on one line needs a terminator for the then-branch, while a lambda body inside that branch would swallow the colon.

## Decision

An inline then-branch is a single statement that ends at the first `:` not nested inside brackets. An inline lambda inside a then-branch swallows the `:`, and the parser reports that with a hint to use parentheses or margin lines rather than guessing.

## Consequences

- `a ? xs -> each n | n -> print-ln : "else" -> print-ln` is a parse error with an explanation.
