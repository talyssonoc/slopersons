# Print chars bare, like strings

## Status

Accepted

## Context

Human-readable output should show the character itself, while output inside containers should remain readable as a literal.

## Decision

`` `a` -> print-ln `` writes `a`. Inside arrays and hashmaps, and through `show`, chars appear in backticks, just as strings appear quoted there.

## Consequences

- `print-ln` and `show` differ for chars exactly as they do for strings.
