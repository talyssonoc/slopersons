# Treat closing a standard stream as a flush

## Status

Accepted

## Context

With the standard streams as stream values, a procedure that writes a report to a stream it is given and then closes it can be handed `io/stdout`. The language needed to say what that close does, and what happens to a stream after it is closed.

## Decision

- `stream/close` on `io/stdin`, `io/stdout` or `io/stderr` flushes it and leaves it open; the standard streams stay open for the whole program.
- Closing a file stream that is already closed does nothing.
- Reading, writing or flushing a closed file stream is a runtime error: `cannot read "notes.txt": the stream is closed`.

Rejected:

- Making it an error to close a standard stream: a procedure that closes whatever stream it is given would fail when given `io/stdout`.
- Really closing the standard stream, as Python and Go do: a later `io/print-line` would fail, while the interpreter itself goes on writing to standard error for errors and to standard output for the REPL's echo. Rust takes the same route as this decision: its handle to standard output is never closed.
- An error on a second close: closing twice is harmless and common in cleanup code, which `always` encourages.

## Consequences

- A procedure can take any stream and close it when done, whether it was given a file or a standard stream.
- A program cannot signal end of output to a reader by closing standard output; it ends the program instead.
