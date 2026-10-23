# Use conventional operator precedence

## Status

Accepted

## Context

Strict left-to-right evaluation, as in Smalltalk, was considered for consistency with the flow shape and for parser simplicity.

## Decision

`*`, `/` and `mod` bind tighter than `+` and `-`; comparisons sit below arithmetic; `not` binds tighter than `and`, which binds tighter than `or`. Comparisons cannot be chained: `a < b < c` is a parse error that suggests `and`.

Rejected: strict left-to-right evaluation. It would have required parentheses on every compound condition, as in `(n > 1) and (n < 10)`, and bought no visible distinctiveness.

## Consequences

- Arithmetic reads as it does everywhere else.
- A chained comparison fails at parse time instead of producing a type error at run time.
