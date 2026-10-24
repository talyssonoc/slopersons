# Shape every statement as a left-to-right flow

## Status

Accepted

## Context

Slopersons is meant to have a syntax whose shape resembles no mainstream language. Novelty at the token level is impossible, since every glyph and keyword exists somewhere, so the distinctiveness budget went into statement shape, call shape and block shape, while arithmetic and literals stayed ordinary on purpose.

## Decision

Every statement is a flow: data on the left, steps on the right, joined by `->`. The piped value becomes the first argument of the procedure it flows into, and further arguments follow the procedure's name. There is no `f(x)`, no `x.f()` and no `a[i]`; indexing is `-> at i`.

Rejected:

- Sentence templates with holes (Inform 7 style, `add 5 to "rent" in budget`): the most distinctive option, but parsing user-defined mixfix templates is a real risk for a first interpreter.
- Prefix fixed-arity syntax (Logo style, `print join "a" b`): simple to parse, but it reads as a known family and arity mistakes cascade badly.

## Consequences

- The grammar has a single call form and every call reads left to right.
- A procedure with no input needs a way to be called, which led to `do`.
- Using a flow's result inside an arithmetic or comparison expression requires parentheses.
