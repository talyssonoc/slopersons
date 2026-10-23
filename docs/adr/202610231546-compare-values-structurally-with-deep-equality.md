# Compare values structurally with deep equality

## Status

Accepted

## Context

Containers are mutable, and the language has no separate identity comparison.

## Decision

`=` compares any two values structurally: arrays element by element, hashmaps by key set and values regardless of insertion order. Values of different types are unequal rather than an error, so `1 = 1.0` is `no`. Hashmap and set keys may be any value and are hashed structurally. Mutating a key after insertion leaves the container in an undefined state and is documented as such.

## Consequences

- Procedures are equal only to themselves.
- Structural hashing of nested containers is linear in their size.
