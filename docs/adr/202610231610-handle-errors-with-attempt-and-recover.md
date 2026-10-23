# Handle errors with `attempt` and `recover`

## Status

Superseded by [Run cleanup with always after attempt](./202610231615-run-cleanup-with-always-after-attempt.md)

## Context

Until now any runtime error ended the program, and the only way to survive bad input was to validate it beforehand: the calculator example carried a hand-written `looks-like-number` because `to-int` on bad text was fatal. Error handling was deferred from the first design round. Two choices were put to the project owner: the keywords, and how the two bodies scope.

## Decision

A statement with two bodies:

```
attempt
| risky -> do => value
recover e
| "problem: {e}" -> print-ln
```

- `attempt` runs its body. If a runtime error is raised anywhere inside it, including in called procedures, the `recover` body runs with the error bound to the optional name. The statement's value is the value of the body that finished, so a parenthesized `attempt` is an expression.
- Both bodies share the surrounding scope, like conditional branches. The error name is bound in that scope with parameter semantics, so it may reuse a name that exists outside.
- `recover` ends any inline body, which keeps the one-line and expression forms unambiguous. An `attempt` without a `recover` is a parse error.
- A caught error is a value of a new type `error` carrying the message and the raising position (`message`, `line`, `column`). It prints as its message. `fail` given an error value raises it again unchanged.
- Catchable: every runtime error, from the interpreter or from `fail`, including the call depth and size limits. Not catchable: parse errors, `exit`, `out`, `stop`, memory exhaustion, and interpreter bugs.
- No `finally`: the language has no resources to release. No error kinds yet: handlers that need to distinguish errors inspect the message or raise their own.

Rejected:

- `try`/`catch` or `try`/`rescue`: recognizable, but they read as the C family or Ruby; `attempt`/`recover` are two plain verbs no mainstream language pairs.
- A handler body with its own scope and the error as a parameter: the name would never leak, but binding a fallback value would require `=>>` with a prior declaration or the expression form.
- Result values instead of raising, in the style of Go or Rust: a different language; the project already decided that missing keys and bad conversions raise.

## Consequences

- Programs can recover from expected failures such as bad input without validating ahead of time; the calculator lost its number checker.
- The error name stays bound after the handler, a small wart accepted for simplicity.
- An error taxonomy (`kind`) remains open and can be added without changing the construct.
