# Make procedures first-class values

## Status

Accepted

## Context

During the design discussion the recommendation was block arguments only, in the style of Ruby or Smalltalk blocks: callbacks for the standard library without procedures as storable values. The project owner chose full first-class procedures instead.

## Decision

A bare name is always a value lookup, including when it names a procedure. `numbers -> map double` passes the procedure, `double => d` aliases it, and calls happen only through `->`.

Rejected:

- Block arguments only: no stored lambdas, no closures as values.
- No callables at all: the standard library could not offer `map`, `keep` or `sort-by`.

## Consequences

- Closures, higher-order procedures and procedures stored in hashmaps all work.
- Zero-input calls need a marker, since a bare procedure name is the procedure itself.
- Procedures print as `<proc name>` or `<lambda>` and compare by identity.
