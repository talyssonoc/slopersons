# Require boolean conditions

## Status

Accepted

## Context

Truthiness rules differ between languages and hide mistakes: `0`, an empty string, an empty collection and an absent value each count as false somewhere and true elsewhere.

## Decision

`?` and `while` accept only `yes` or `no`. Any other value in a condition is a runtime error, and there is no implicit coercion anywhere in the language.

Rejected: truthiness.

## Consequences

- Conditions are written explicitly, for example `-> is-empty` or `= nothing`.
- A value used as a condition by mistake fails loudly at the point of use.
