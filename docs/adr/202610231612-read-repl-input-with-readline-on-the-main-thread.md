# Read REPL input with readline on the main thread

## Status

Accepted

## Context

The first REPL read lines inside the worker with the same blocking reader programs use. That gave the terminal's basic editing only: the arrow keys printed escape sequences and there was no history. Node's `readline` provides editing and history, but it must own standard input on the main thread, while the program runs on a worker that reads input synchronously, including when an entry calls `read-line`.

## Decision

The entry rules of the first REPL stand unchanged: a complete line runs at once and echoes its value as `-> value`; a line the parser marks incomplete, or a call ending in unbound names, collects a block under the `..` prompt until an empty line; errors keep the session alive; `exit` and end of input end it.

What changes is where input is read. In REPL mode the main thread creates a `readline` interface over standard input and output. The worker asks for a line by posting a request with the prompt to show and then blocks on `Atomics.wait` over a shared buffer; the main thread shows the prompt through readline, delivers the next line into the shared buffer, and wakes the worker. End of input is delivered the same way. Because the worker's `readLine` is still a synchronous call, `read-line` inside an entry works unchanged, and programs run from a file keep their direct blocking reader.

Rejected:

- A hand-written line editor over raw mode in the worker: a large amount of terminal handling to reproduce what readline already does.
- Switching readline off before each evaluation: the worker can call `read-line` at any time during an entry, so there is no safe moment to hand the terminal back and forth.

## Consequences

- Arrow keys, history (200 entries) and the usual editing shortcuts work in the REPL.
- A line longer than the shared buffer (1 MiB) is cut at the buffer size.
- The REPL has two cooperating threads, so prompt output is written by the main thread while results are written by the worker; the order is preserved because the worker only writes after the line it asked for has arrived.
