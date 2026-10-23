# Make builtins a fallback namespace

## Status

Accepted

## Context

With the shadowing error for `=>`, treating builtins as an enclosing scope would make common variable names such as `sum`, `lines`, `max` and `date` collide with the standard library.

## Decision

Name lookup checks the scope chain first and the builtin table last, and `=>` never treats a builtin as an enclosing binding. `[1 2] -> length => length` works and hides the builtin within that scope.

## Consequences

- A user binding may take a builtin's name without error.
- A program that shadows a builtin loses access to it within that scope.
