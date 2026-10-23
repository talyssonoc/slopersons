# Distinguish ints from floats, with floored int division

## Status

Accepted

## Context

The brief asked for int and float as separate primitives. Division between ints is where dynamic languages differ most.

## Decision

Ints and floats are distinct types. An operation on two ints yields an int: `/` floors toward negative infinity and `mod` takes the sign of the divisor, as in Python, so `a = (a / b) * b + (a mod b)` always holds. Any float operand promotes the result to float. Division or `mod` by zero is an error for both types.

Rejected:

- `/` always producing a float, which would make `7 / 2` lose the int type.
- Truncating division, which breaks the identity with `mod` for negative operands.

## Consequences

- `7 / 2` is `3` and `-7 / 2` is `-4`.
- A program that wants a fractional result promotes first, as the calculator example does with `a * 1.0 / b`.
