# Merge continuation lines in the parser, not the lexer

## Status

Accepted

## Context

A line starting with `->` continues the flow above it. The first design had the lexer join such lines, but a block between two pieces of a split flow must attach to the step that precedes it:

```
numbers -> keep n
| n > 10
-> map n
| n * 2
```

Joining the lines in the lexer would have lost which step each block belongs to.

## Decision

The lexer keeps continuation lines separate. The parser merges a line starting with `->` into the previous statement at the same depth, and each piece keeps its own block, so the first block belongs to `keep` and the second to `map`.

## Consequences

- Multi-line pipelines are the natural way to chain several lambdas.
- A continuation with no flow above it is a parse error.
