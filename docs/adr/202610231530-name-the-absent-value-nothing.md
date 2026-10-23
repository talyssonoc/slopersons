# Name the absent value `nothing`

## Status

Accepted

## Context

A value for "no result" was needed for `read-line` at end of input, for searches that find nothing, and for a conditional with no branch taken.

## Decision

The absent value is the literal `nothing`, a type of its own.

Rejected: `nil` (Ruby, Lisp), `null` (C family), `none` (Python).

## Consequences

- `nothing` is a reserved word and prints as `nothing`.
- Because conditions must be booleans, absence is tested with `= nothing`, never by truthiness.
