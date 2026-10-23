# Fail on missing keys and out-of-range indexes

## Status

Accepted

## Context

A missing hashmap key or an index past the end usually means a typo or a logic error, and a silent sentinel forces every consumer to check for it.

## Decision

`-> at` fails on a missing hashmap key or an out-of-range array or string index. `-> at-or key default` returns a default and `-> has key` checks membership.

Rejected: returning `nothing`, which makes typos silent and spreads checks to every consumer.

## Consequences

- Typos in keys fail at the access that made them.
- Code that expects absence says so with `at-or` or `has`.
- Searching, as in `index-of` and `find`, is a different situation and is decided separately.
