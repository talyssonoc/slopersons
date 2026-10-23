# Start comments with `~`

## Status

Accepted

## Context

Every common comment marker belongs to a known family: `#` to shells, Python and Ruby; `//` to C; `--` to SQL, Haskell and Lua; `;` to Lisp and assembly.

## Decision

A comment starts with `~` and runs to the end of the line.

Rejected: `#`, `//`, `--`, `;`.

## Consequences

- `~` is not available as an operator.
