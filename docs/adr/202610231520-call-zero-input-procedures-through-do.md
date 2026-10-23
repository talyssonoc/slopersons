# Call zero-input procedures through `do`

## Status

Accepted

## Context

With bare names as values, `today` on its own is the procedure, not a call, and every flow needs a head value. A way to call a procedure that has no input was required.

## Decision

`do` is an ordinary builtin that calls its input with the remaining arguments: `today -> do`, `handler -> do 1 2`, `(ops -> at "square") -> do 7`.

Rejected:

- A leading `-> today` on a line: a line starting with `->` continues the previous flow, and multi-line pipelines were judged the more valuable feature.
- An empty-source token such as `()` or `_`: it adds a value to the language for a single use.

## Consequences

- No new syntax was needed.
- Zero-input calls cost two extra tokens.
- `do` doubles as an explicit apply when the procedure is an expression.
