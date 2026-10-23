# Return the container from mutating builtins

## Status

Accepted

## Context

`xs -> push 1 -> push 2` reads naturally only if `push` returns the array it changed.

## Decision

Builtins that mutate in place (`put`, `push`, `insert`, `remove-at`, `add`, `remove`) return the same container so flows can continue. `pop` is the exception and returns the removed element, because that is what callers want from it.

## Consequences

- Chains of mutations read as a single flow.
- A reader must know that the returned container is the same object, not a copy.
