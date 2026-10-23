# Represent open files and the standard streams as stream values

## Status

Accepted

## Context

The language could read standard input a line at a time and write to standard output, and nothing else. The project owner asked for basic file handling. Two shapes were weighed: functions that read or write a whole file in one call, with no new type, and handles that a program opens, reads or writes piece by piece, and closes. The owner also wanted standard input and standard output to be the same kind of thing as an open file.

## Decision

- An open file is a value of a new type, `stream`. Functions that work on a stream live in a `stream` module, following [Organize the standard library into modules](./202610231614-organize-the-standard-library-into-modules.md): `in -> stream/read-line`, `out -> stream/write text`, `handle -> stream/close`.
- Standard input, standard output and standard error are `stream` values held by the `io` module as `io/stdin`, `io/stdout` and `io/stderr`, so `io/stdin -> stream/read-line` works without `do`. They are the first members of a builtin module that are not procedures.
- A procedure that takes a stream works the same whether it is given an open file or `io/stdout`.

Rejected:

- Whole-file functions only. They need no new type and nothing to close, but the whole file has to fit in memory as one string: the worker's heap limit is 1024 MB by default, `string/lines` holds a second copy, and V8 caps a single string at 536,870,888 UTF-16 units whatever the heap limit. They also return only at the end of the input, so a pipe or a log that is still being written cannot be processed as it arrives, and standard input could not be passed where a file is expected.
- Naming the type `file`: standard input is usually a pipe or a terminal, not a file.
- Putting the stream functions in `io`: their receiver is a stream, so by the module rule they belong to `stream`; `io/read-line` also takes no input today, and giving it a stream would either break every program that calls it or make its number of inputs vary.

## Consequences

- A new value type needs its printed form, its `type-of` name, its equality and hashing, and a place in `semantics.md`.
- Streams have to be closed. `always` ([Run cleanup with `always` after `attempt`](./202610231615-run-cleanup-with-always-after-attempt.md)) is the cleanup tool, and it does not run on `exit`, so whatever a stream holds must not be lost when the program exits with open streams.
- Reading files a chunk at a time needs a reader that keeps the bytes it read past the current line and decodes UTF-8 across chunk boundaries; standard input in a program uses the same reader.
- Follow-up decisions: how a file is opened for reading, writing or appending; what reading or writing a closed stream does, and whether closing a standard stream is allowed; whether file writes are buffered and when they are flushed; how operating-system failures (missing file, permission denied, a directory where a file was expected) become error messages; what invalid UTF-8 in a file does.
