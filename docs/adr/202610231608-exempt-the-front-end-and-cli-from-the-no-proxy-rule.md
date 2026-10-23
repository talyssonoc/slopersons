# Exempt the lexer, parser and CLI from the no-proxy rule

## Status

Accepted

## Context

The rule against proxying JavaScript targets language-visible behavior. The lexer and parser operate on source text at compile time, and the CLI is the boundary to the operating system.

## Decision

The no-proxy rule applies to `src/values.ts`, `src/runtime/**` and `src/stdlib/**`. The lexer and parser may use `Set`, `startsWith` and similar; `src/cli.ts` may use whatever Node provides. `test/no-proxy.test.ts` encodes exactly this split and fails on new violations.

## Consequences

- Front-end code stays simple.
- Adding an allowed exception means extending the test's rules, which makes the exception visible in review.
