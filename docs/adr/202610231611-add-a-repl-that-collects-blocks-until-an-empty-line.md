# Add a REPL that collects blocks until an empty line

## Status

Superseded by [Read REPL input with readline on the main thread](./202610231612-read-repl-input-with-readline-on-the-main-thread.md)

## Context

The plan had the CLI read a program from standard input when no file was given; that was never built. An interactive session, `slopersons --repl`, replaces that plan: it lets someone try the language one entry at a time, seeing each result, instead of writing a whole program first. Two properties of the language shape the design: a statement can span lines through margin blocks, `:` lines, `recover` lines and continuation lines, and programs already read input with a blocking line reader inside the worker thread.

## Decision

- A line that parses as a complete statement runs at once, and the value of the entry is echoed as `-> value` in the form `show` uses, unless it is `nothing`.
- A line the parser rejects as incomplete starts a block entry. The parser marks these errors (`needs a body`, `needs a recover`, an unclosed bracket, end of line where a value or name was expected) so the REPL does not match message text. Block lines are collected under a `..` prompt until an empty line, then the whole entry runs. An entry still pending when input ends runs before the session exits.
- A complete line whose last call ends with bare names that are not bound in the session (`xs -> each n`) also starts a block entry, since unbound trailing names are lambda parameters by the language's own rule. An empty line runs it as written.
- Errors print with the position inside the entry and the session continues; `exit` and end of input end it.
- The REPL runs in the same worker as programs and reads lines with the same blocking reader, so `read-line` inside an entry works unchanged. There is no line history or cursor movement in this version.

Rejected:

- Running every line as soon as it parses: `proc f n` followed by one body line parses, so the procedure would be defined with a one-line body before the user finished it.
- Waiting one line after every complete entry to see whether a block follows: the result of a plain expression would not appear until the next line.
- Node's `readline` on the main thread for history and editing: it puts the terminal in raw mode, which would feed raw keystrokes to the worker's blocking reader when an entry calls `read-line`, and it would mean two execution models.

## Consequences

- Block entries cost one extra Enter, which matches how Python's REPL ends compound statements.
- A call whose last argument is an unbound variable also waits for an empty line before reporting the unknown name.
- Line history can be added later behind the same entry rules.
