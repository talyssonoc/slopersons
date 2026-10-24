# Return the REPL to its prompt on Ctrl-C

## Status

Accepted

## Context

[Make Ctrl-C end a program the way `exit` does](./202610241708-make-ctrl-c-end-a-program-the-way-exit-does.md) also made Ctrl-C end a REPL session with 130, because that is what `exit` does. In a REPL that means a runaway entry costs the whole session: every binding and procedure typed so far. Python's and Node's REPLs stop the entry and go back to the prompt instead, keeping the session.

This replaces only the REPL part of that record. For programs, Ctrl-C still works as it decided:
- it behaves like `130 -> exit`;
- the interpreter checks for it at every call and `while` pass;
- the main thread cancels whatever the worker waits on, standard input included;
- a second Ctrl-C ends the process.

## Decision

- An interruption is raised as `InterruptSignal`, a subclass of `ExitSignal`. Everything that treats `exit` specially treats it the same way: `attempt` does not catch it, `always` does not run, and a program exits with 130.
- In the REPL, an `InterruptSignal` from a running entry stops that entry, prints `interrupted` on standard error and returns to the prompt. The session keeps its bindings.
- Ctrl-C at the prompt drops what is being typed: the lines of a block entry being collected and, in a terminal, the text on the current line. Then a new prompt is shown. Ctrl-D still leaves.
- After handling an interruption, the REPL resets the shared flag, so the next Ctrl-C counts as a first one again. A second Ctrl-C before the first is handled still ends the process, which is how an entry stuck in a system call is escaped.

Rejected:

- Keeping the session-ending behaviour. Ctrl-C on a slow entry is routine in a REPL, and losing the session for it is not.
- Node's "press Ctrl-C again to exit" at the prompt. Ctrl-D already leaves, and a second Ctrl-C is reserved for ending a stuck process.

## Consequences

- A program and a REPL entry react differently to the same key. The difference is only in what happens after the code stops.
- An entry interrupted halfway may have changed some bindings and not others, as with an error.
