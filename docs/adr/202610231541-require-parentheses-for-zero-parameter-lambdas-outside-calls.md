# Require parentheses for zero-parameter lambdas outside calls

## Status

Accepted

## Context

Leading bars on a line are margins, so a line cannot start with a lambda bar.

## Decision

A zero-parameter lambda used as a value is written in parentheses, `(| "hello" -> print-ln) => greet`. After a call it needs no parentheses: `3 -> repeat | "hi" -> print-ln`.

## Consequences

- The margin-bar block syntax stays unambiguous.
