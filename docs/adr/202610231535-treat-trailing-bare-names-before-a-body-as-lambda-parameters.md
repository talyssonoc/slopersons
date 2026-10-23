# Treat trailing bare names before a body as lambda parameters

## Status

Accepted

## Context

A lambda passed to a call is written after the call's arguments, as in `xs -> reduce 0 acc n | acc + n`. The parser must decide where arguments end and parameters begin without type information.

## Decision

When a call is followed by an inline lambda body or a margin block, the maximal run of bare names at the end of its arguments becomes the lambda's parameters. A variable meant as an argument in that position must be parenthesized: `xs -> fold (start) acc n | ...`.

Rejected: a marker before parameters, such as a backslash or a keyword, which would appear in every `each` and `map`.

## Consequences

- `xs -> fold start acc n | ...` treats `start` as a parameter; the mistake surfaces as an arity error at call time, never as silent wrong behavior.
