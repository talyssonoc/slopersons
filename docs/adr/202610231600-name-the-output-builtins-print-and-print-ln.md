# Name the output builtins `print` and `print-ln`

## Status

Superseded by [Rename `print-ln` to `print-line`](./202610231906-rename-print-ln-to-print-line.md)

## Context

The first version had `print`, which added a newline, and `write`, which did not. Nothing in those names says which one ends the line, and the project owner asked for a pair whose names carry the difference.

## Decision

`print` writes exactly what it is given and `print-ln` adds the line break, following Java, Kotlin, Go and Rust where the suffix carries the only difference. `print` without a newline exists so that a prompt can stay on the same line as the answer.

Rejected: `print` and `write`; Ruby's `puts` and `print` split, which has the same problem of two unrelated verbs.

## Consequences

- The everyday call is the longer `print-ln`, judged a fair price for never having to remember which verb adds the newline.
