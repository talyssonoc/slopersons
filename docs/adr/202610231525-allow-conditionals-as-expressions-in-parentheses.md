# Allow conditionals as expressions in parentheses

## Status

Accepted

## Context

Without an expression form, `n > 10 ? "big" : "small" => size` binds `size` only in the else branch, because the then-branch is the statement `"big"` and the else-branch is the statement `"small" => size`. That is a trap.

## Decision

A parenthesized statement may be a conditional, and its value is the value of the branch that ran, or `nothing` when none did. So `(n > 10 ? "big" : "small") => size` works. `while` and `proc` are not values and are rejected inside parentheses.

## Consequences

- The grammar's parenthesized primary accepts a statement rather than only a flow.
- Interpolations can hold a conditional: `"{n > 1 ? "many" : "one"} items"`.
