# Names are kebab-case, so binary operators need spaces

## Status

Accepted

## Context

`snake_case` reads as Python, Ruby or C and `camelCase` reads as JavaScript or Java. Kebab-case is used by the Lisp family and fits the flow style, but it makes `a-b` a name.

## Decision

A name matches `[A-Za-z][A-Za-z0-9]*(-[A-Za-z0-9]+)*`. `a-b` is one name, `a - b` is a subtraction, and `a -b` is a parse error: a unary minus followed by an operand where an operator was expected. Spaces around binary operators are therefore mandatory.

Rejected:

- `snake_case` or `camelCase` names.
- Treating `a-b` as subtraction, which would forbid hyphenated names.

## Consequences

- The lexer decides whether `-` is part of a name, a unary minus or a binary minus from its surroundings.
- Examples and golden programs must keep spaces around operators, which is an invariant in `CLAUDE.md`.
