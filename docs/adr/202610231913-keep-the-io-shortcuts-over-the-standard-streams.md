# Keep the io shortcuts over the standard streams

## Status

Accepted

## Context

Once standard input and output are stream values ([Represent open files and the standard streams as stream values](./202610231912-represent-open-files-and-the-standard-streams-as-stream-values.md)), `io/read-line -> do` and `io/stdin -> stream/read-line` do the same thing, and [Organize the standard library into modules](./202610231614-organize-the-standard-library-into-modules.md) rejected two ways to say the same thing. Dropping `io/read-line` was proposed on that ground, since it is not even shorter. Against it: asking the person at the keyboard for data, or printing to them, is the most common thing a program does, and it should not require knowing about both `io` and `stream`.

## Decision

`io/read-line`, `io/print` and `io/print-line` stay, and they are operations on the standard streams: `io/read-line` reads a line from `io/stdin`, and `io/print` and `io/print-line` write to `io/stdout`. They share those streams' state, so a program can mix `io/read-line -> do` and `io/stdin -> stream/read-line` freely and each line is read once.

The output shortcuts also differ in shape from the stream functions: they take the data as the piped value and return it, so `x -> io/print-line -> ...` prints in the middle of a flow, while `io/stdout -> stream/write-line x` pipes the stream.

Rejected:

- Dropping `io/read-line` and reading only through `io/stdin -> stream/read-line`: the most common interaction with a user would need two modules.
- Keeping the shortcuts with their own reader on file descriptor 0: a stream reads ahead in chunks, so each reader would hold bytes the other never sees and lines would be lost when a program used both.

## Consequences

- Reading a line from standard input has two spellings, an exception to the module rule that this record makes on purpose.
- The shortcuts cannot keep their current direct path to the file descriptors once streams exist; they go through the standard stream objects, which in the REPL read through the shared-memory relay from the main thread.
- Simple programs never need to touch the `stream` module.
