# Represent ints as BigInt

## Status

Accepted

## Context

JavaScript has one number type. Ints needed a representation that keeps them distinct from floats.

## Decision

Ints are JavaScript `BigInt` values with arbitrary precision; floats are JavaScript numbers.

Rejected: JavaScript numbers with an int tag, which lose precision above 2^53 and would either error there or let JavaScript behavior leak through.

## Consequences

- Ints never overflow, and int and float are genuinely different representations.
- Arithmetic loops are slower, and every array index conversion goes through a BigInt-to-number check.
