# Model dates as calendar dates without time

## Status

Accepted

## Context

The brief asked for a date object. Time of day, time zones and daylight saving multiply the surface and the error cases.

## Decision

A date is an immutable calendar date in the proleptic Gregorian calendar, stored as days since 1970-01-01 and converted with the standard civil-from-days algorithms. `today` uses the UTC day. There is no time of day in this version.

## Consequences

- Date arithmetic is exact integer arithmetic.
- Times, zones and durations are left for a later decision.
