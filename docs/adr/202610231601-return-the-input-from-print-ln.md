# Return the input from `print-ln`

## Status

Accepted

## Context

Debugging a pipeline by printing an intermediate value should not require restructuring the flow.

## Decision

`print-ln` and `print` return the value they were given, so `x -> print-ln -> double` prints `x` and keeps flowing.

## Consequences

- A print can be inserted anywhere in a flow and removed again without other changes.
