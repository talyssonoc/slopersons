# Bind an inline else to the nearest conditional

## Status

Accepted

## Context

Nested inline conditionals such as `a ? b ? 1 : 2 : 3` have the classic dangling-else ambiguity.

## Decision

A `:` belongs to the nearest preceding `?` that does not yet have a final else. In the example, the inner conditional takes `: 2` and the outer takes `: 3`.

## Consequences

- The rule matches what most languages do, and margin form is available when the inline form gets hard to read.
