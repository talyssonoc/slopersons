# Point builtin errors at the call arrow

## Status

Accepted

## Context

A builtin has no source position of its own, but its errors still need a location in the program.

## Decision

A runtime error raised inside a builtin carries the position of the `->` that called it. Errors raised by the evaluator itself, such as an unknown name or a bad operand, point at the offending token.

## Consequences

- Every error has a line and column.
- An error inside a long flow points at the step that failed, not at the start of the line.
