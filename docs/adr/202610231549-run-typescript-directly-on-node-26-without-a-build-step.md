# Run TypeScript directly on Node 26 without a build step

## Status

Accepted

## Context

The brief asked for an interpreter that is easy to run, like a file with a Node shebang. Node 26, the version installed on the development machine, strips erasable TypeScript syntax with no flag.

## Decision

The interpreter is TypeScript executed directly by Node. `tsconfig.json` sets `erasableSyntaxOnly` (TypeScript 5.8 and later) so anything Node could not run fails the type check instead of failing at load. `tsc --noEmit` is the type checker; Node never type-checks.

Rejected:

- Plain JavaScript with JSDoc types: zero tooling, but weaker refactoring safety in a parser and evaluator.
- TypeScript with a build step: supports all syntax but adds a build to run or install.

## Consequences

- No enums, namespaces or parameter properties; `import type` for types; relative imports include the `.ts` extension.
- Type stripping does not check types, so the typecheck runs in tests and CI.
