# Allow continuation lines to start with a binding

## Status

Accepted

## Context

Continuation lines originally had to start with `->`, so a long pipeline could not end with its binding on its own line.

## Decision

A line starting with `->`, `=>` or `=>>` continues the statement above it at the same depth.

## Consequences

- A pipeline can end with `=> result` on a line of its own.
