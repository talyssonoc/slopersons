# Write chars between backticks

## Status

Accepted

## Context

Chars are a primitive, so they need a literal. `'a'` is the C, Rust and Haskell spelling.

## Decision

A char literal is one code point or one escape between backticks: `` `a` ``, `` `👍` ``, `` `\n` ``.

Rejected: `'a'`, `\a` (Clojure), `#a`.

## Consequences

- Backticks inside Markdown documentation need double-backtick code spans.
