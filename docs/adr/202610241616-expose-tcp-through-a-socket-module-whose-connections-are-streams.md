# Expose TCP through a socket module whose connections are streams

## Status

Proposed

## Context

With socket calls able to block ([Make socket calls block by handing them to the main thread](./202610241615-make-socket-calls-block-by-handing-them-to-the-main-thread.md)), programs need names for them. Files already have a shape programs know: `file/open` returns a stream, and the `stream` module reads, writes, flushes and closes it ([Represent open files and the standard streams as stream values](./202610231912-represent-open-files-and-the-standard-streams-as-stream-values.md)). A server also needs something that is not a stream: the thing it accepts connections from.

## Decision

- A `socket` module with six members:
  - `host -> socket/listen port` returns a listener;
  - `listener -> socket/accept` returns a connection;
  - `host -> socket/connect port` returns a connection;
  - `listener -> socket/port` returns the listener's port;
  - `connection -> socket/set-timeout milliseconds` sets the connection's timeout;
  - `listener -> socket/close` stops listening.
- A connection is a stream, opened for reading and writing, printed as `<stream connection from 127.0.0.1:53114>` or `<stream connection to example.com:80>`. Everything in the `stream` module works on it, and a connection left open is flushed and closed when the program ends, like a file.
- A listener is a new type, `listener`, printed as `<listener 127.0.0.1:8080>` and equal only to itself.
- `socket/listen` takes the host as its piped value and has no default. Choosing between `"127.0.0.1"` (this machine only) and `"0.0.0.0"` (the whole network) is a security decision, so the program states it. It also gives `socket/listen` the same shape as `socket/connect`.
- Port `0` asks the operating system for a free port, and `socket/port` reports it.
- `socket/close` takes only listeners and points connections to `stream/close`, so there is one way to close a connection.
- Writes on a stream without a position (standard input, connections) no longer throw away input the stream has already read ahead. Until now only read-write files could both read and write, and for them a write must discard it.

Rejected:

- `port -> socket/listen` with a default host. The first sketch had it, but a default of all interfaces exposes a program on the network without the author choosing to, and a default of `127.0.0.1` surprises anyone deploying.
- A callback form, `port -> socket/serve | connection | ...`. It is the accept loop with its error handling and closing hidden; HTTP can offer that shape, built on `socket/accept`.
- A separate `connection` type with its own read and write members. They would duplicate the `stream` module.

## Consequences

- A procedure that reads or writes a stream works on files, standard streams and connections alike, so the HTTP layer can be tested on a file holding a raw request.
- `type-of` gains `listener`, and JSON, equality, hashing and printing handle it.
- The connection itself is the only way to recognise a socket stream: `socket/set-timeout` given a file stream reports that it needs a connection.
