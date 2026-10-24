# Make procedures first-class values

## Status

Accepted

## Context

The smallest option was block arguments only, in the style of Ruby or Smalltalk blocks: callbacks for the standard library, with procedures never stored as values. That covers `map` and `keep`, but not a procedure kept in a variable, passed by name, stored in a hashmap or returned from another procedure.

## Decision

A bare name is always a value lookup, including when it names a procedure. `numbers -> map double` passes the procedure, `double => d` aliases it, and calls happen only through `->`.

Rejected:

- Block arguments only: no stored lambdas, no closures as values.
- No callables at all: the standard library could not offer `map`, `keep` or `sort-by`.

## Consequences

- Closures, higher-order procedures and procedures stored in hashmaps all work.
- Zero-input calls need a marker, since a bare procedure name is the procedure itself.
- Procedures print as `<proc name>` or `<lambda>` and compare by identity.
