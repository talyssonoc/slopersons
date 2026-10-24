# Buffer file streams and write them out when the program ends

## Status

Accepted

## Context

Streams need a policy for when bytes move between the program and the operating system. Standard output is written synchronously, one system call per `io/print-line` ([Write program output synchronously to the file descriptors](./202610231607-write-program-output-synchronously-to-the-file-descriptors.md)), so prompts appear before the program waits for input. Standard input was read one byte per system call. Files are new, and their policy should be one a programmer from another language expects, without the machinery of a large standard library. `always` does not run on `exit` ([Run cleanup with `always` after `attempt`](./202610231615-run-cleanup-with-always-after-attempt.md)), so a program cannot be trusted to close every stream itself.

## Decision

- File streams read and write through 64 KiB buffers. A line longer than the buffer grows it.
- Buffered writes reach the file when the buffer fills, on `stream/flush`, on `stream/close`, and when the program ends: when it finishes, when it calls `exit` and when it stops with an error. The interpreter keeps a registry of open file streams and closes them all at that point; the REPL does the same when the session ends.
- A failure while writing them out at the end is printed as an `error:` line, and a program that would have exited with 0 exits with 1.
- Standard output and standard error stay unbuffered.
- Standard input is read in chunks of up to 64 KiB through the same reader as files, so `io/read-line` and `io/stdin -> stream/read-line` share one buffer.

Rejected:

- Unbuffered file writes, one system call per `stream/write` as for standard output: nothing could be lost, but a program writing a million lines would make a million system calls.
- Buffering standard output: prompts written with `io/print` would sit in the buffer while the program waits for input.
- Leaving unflushed data unwritten when the program ends without closing its streams: the data would be lost silently. C's `exit` flushes open `FILE`s and Python flushes at exit as well.

## Consequences

- What a stream wrote is visible to `file/read`, to another stream or to another process only after a flush or a close.
- Data still in a buffer is lost if the interpreter is stopped from outside: memory exhaustion, or standard output closing under the program, which terminates the worker.
- Reading standard input no longer costs a system call per byte.
