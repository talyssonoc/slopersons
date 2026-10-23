# Return `nothing` from searches that find nothing

## Status

Accepted

## Context

Missing keys are errors because they usually mean a typo, but "not found" is a legitimate answer to a search.

## Decision

`index-of` and `find` return `nothing` when there is no match rather than failing.

## Consequences

- Callers of a search check for `nothing`; callers of `at` do not have to.
- These are among the few builtins whose result can be `nothing`, and their documentation says so.
