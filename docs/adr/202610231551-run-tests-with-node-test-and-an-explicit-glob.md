# Run tests with `node --test` and an explicit glob

## Status

Accepted

## Context

Whether Node's default test file patterns include `.ts` files could not be confirmed from documentation.

## Decision

Tests use the built-in `node:test` runner with no framework dependency, and `package.json` passes the glob `test/**/*.test.ts` explicitly.

## Consequences

- The test command works the same on any Node 26 release regardless of default patterns.
