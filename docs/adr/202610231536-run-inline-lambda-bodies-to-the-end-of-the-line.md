# Run inline lambda bodies to the end of the line

## Status

Accepted

## Context

An inline lambda body such as `n | n > 10 ? n -> print-ln` legitimately contains `?`, `:` and `->`, so no token inside it can terminate it.

## Decision

An inline lambda body runs to the end of the line or to the closing bracket that encloses it. A lambda that is not the last thing in a literal must be parenthesized: `{"double": (n | n * 2)  "square": (n | n * n)}`.

## Consequences

- A flow that continues after a lambda uses a continuation line starting with `->`.
- A stray `|` where a value is expected reports a hint about parentheses.
