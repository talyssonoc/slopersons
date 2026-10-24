# Time out connection reads and writes after 30 seconds

## Status

Accepted

## Context

A program serves one connection at a time ([Make socket calls block by handing them to the main thread](./202610241615-make-socket-calls-block-by-handing-them-to-the-main-thread.md)). A client that connects and never sends anything, or never reads what it is sent, would hold the program, and every client queued behind it, forever. Browsers can open connections ahead of time, through `<link rel="preconnect">` for example, and leave them unused. Nothing in the language can interrupt a blocked call.

## Decision

- Every read and write on a connection fails if it makes no progress within the connection's timeout, and so does `socket/connect` while waiting for the server to answer. The timeout starts at 30 seconds.
- `connection -> socket/set-timeout milliseconds` changes it for later reads and writes on that connection. It takes an int from 1 to 2147483647, the longest delay a Node timer supports, or `nothing` for no timeout. Milliseconds match how `datetime` counts time.
- A read that times out leaves the connection usable. A write that times out closes the connection, because part of the data may already have been sent and the stream cannot know how much.
- The failure is a runtime error that `attempt` can handle: `cannot read the connection from 127.0.0.1:53114: nothing arrived within 30 seconds`.
- `socket/accept` has no timeout. Waiting for the next client is a server's normal state.

Rejected:

- No timeout by default, like Python's `socket` module. With one connection at a time, that default makes a single silent client stop the whole server, and the author finds out in production.
- A timeout on `socket/accept`. It is only useful for doing periodic work between clients, which nothing needs yet.
- Timeouts in seconds, or as floats. Milliseconds as an int are what `datetime` uses, and a test can use a short timeout without fractions.

## Consequences

- An interactive program where a person types into a connection, through `nc` for example, must raise or remove the timeout, or a slow typist is disconnected.
- A server can recover from a silent client by catching the error and closing the connection.
