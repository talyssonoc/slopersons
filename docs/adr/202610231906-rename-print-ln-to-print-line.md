# Rename `print-ln` to `print-line`

## Status

Accepted

## Context

The `io` module held `print-ln` beside `read-line`: two spellings of "line" in a module of three members. File streams will add `stream/read-line` and `stream/write-line` next to the `io` shortcuts, which would spread the mismatch across modules. With one spelling across the standard library, a reader who knows one name can guess the others.

## Decision

`io/print-ln` becomes `io/print-line`; `io/print` keeps its name. The rest of [Name the output builtins `print` and `print-ln`](./202610231600-name-the-output-builtins-print-and-print-ln.md) stands: `print` writes exactly what it is given and the `-line` variant adds the line break, so the suffix still carries the only difference. [Return the input from `print-ln`](./202610231601-return-the-input-from-print-ln.md) and [Print chars bare, like strings](./202610231602-print-chars-bare-like-strings.md) apply to `print-line` unchanged.

Rejected:

- `read-ln` instead, following Pascal's `readln` and `writeln`: it keeps an abbreviation the rest of the standard library avoids (`hashmap`, `datetime`, `boolean`, `string/lines`).
- Keeping `print-ln` as an alias: two names for one function, which [Organize the standard library into modules](./202610231614-organize-the-standard-library-into-modules.md) already rejected.

## Consequences

- The everyday output call is two characters longer.
- Every example, golden program, test and stdlib page was rewritten; ADRs written before this one still say `print-ln`.
- Line-oriented members use `-line` from here on, starting with `stream/read-line` and `stream/write-line`.
