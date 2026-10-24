# Run cleanup with `always` after `attempt`

## Status

Accepted

## Context

The error-handling record left out a cleanup clause because the language had nothing to release. A cleanup clause is still worth having ahead of the resources that will need it, since the construct is cheap to add on top of `attempt`/`recover`.

## Decision

Everything in the error-handling record stands: `attempt` runs a body, `recover e` handles a runtime error with the error bound as a value, both bodies share the surrounding scope, `fail` rethrows an error value, and `exit`, `out`, `stop`, parse errors, memory exhaustion and interpreter bugs are never catchable.

Added:

- An `always` body may follow the `recover` body or the `attempt` body directly, in block or inline form. An `attempt` needs a `recover`, an `always` or both, with `recover` first. Like `recover`, `always` ends any inline body.
- The body runs when control leaves the construct after a normal finish, a handled error, an unhandled runtime error (which then propagates), an `out` or a `stop`. It does not run on `exit` or when the interpreter itself fails, since no user code should run after those.
- Its value is ignored; the statement keeps the value of the body that ran before it. An error raised inside it replaces the pending outcome, as in Java and Python.

Rejected:

- `finally`: the mainstream word, but it mixes families with `attempt`/`recover`.
- `ensure`: Ruby's word; it suggests a precondition rather than cleanup.
- Running the body on `exit`: `exit` is meant to end the program at once.

## Consequences

- Cleanup code lives next to the body it cleans up after, and runs even when a procedure returns early from inside the body.
- A program that needs cleanup on `exit` must do it before calling `exit`.
- The REPL treats an `attempt` followed only by `always` as a complete entry once the cleanup body has a line.
