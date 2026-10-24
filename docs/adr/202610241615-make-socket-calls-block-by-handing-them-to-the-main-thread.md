# Make socket calls block by handing them to the main thread

## Status

Accepted

## Context

Slopersons programs could not talk over the network. Sockets come first, and HTTP is to be written on top of them in slopersons in a later step, as `json` is, so that the protocol is the language's own code rather than Node's. The interpreter is a synchronous tree walker running on a worker thread ([Run programs on a worker thread with a 256 MB stack](./202610231558-run-programs-on-a-worker-thread-with-a-256-mb-stack.md)), and every builtin returns its result before the next step runs: files are read with `readSync` in `src/file-system.ts` and standard input with `readSync` on descriptor 0. Node 26 has no blocking socket API. Its `net` module only reports connections and data through events on an event loop, and the worker cannot run its event loop while a builtin is waiting.

The REPL already solved the same problem for keyboard input ([Read REPL input with readline on the main thread](./202610231612-read-repl-input-with-readline-on-the-main-thread.md)): the worker posts a request and waits with `Atomics.wait`, and the main thread, whose event loop is free, answers through shared memory.

## Decision

- The main thread owns every socket, through `node:net`. Each socket call in the worker posts a request on a dedicated `MessageChannel`, waits with `Atomics.wait` on a shared flag, and takes the reply with `receiveMessageOnPort` once the main thread has posted it and raised the flag. Both halves live in `src/network.ts`, which joins `src/file-system.ts` as a boundary module allowed to import `node:`.
- The interpreter sees a synchronous `Network` interface (`src/runtime/network.ts`); a connection is a `ByteChannel`, so the existing buffered `ChannelStream` reads and writes it. Tests run in-process with a fake `Network`.
- A program handles one connection at a time. The main thread accepts connections as they arrive, which Node cannot postpone, and holds them in a queue until `socket/accept` takes the oldest one. At most 10 connections wait in the queue, a deliberately small fixed bound; the main thread closes any connection beyond that at once.
- Waiting connections are created paused (`pauseOnConnect`), so their data stays in the kernel until the program accepts them. Reads take data on demand with a 64 KiB cap per request, so memory stays bounded however much a client sends.
- Writes wait until Node has handed the bytes to the kernel. A program that writes faster than a client reads is slowed down instead of filling the main thread's memory.
- Connections accept a client's half-close (`allowHalfOpen`): a client may finish sending and still read the answer.
- When the worker exits, the main thread closes every listener and connection and the message channel, so the process can end.

Rejected:

- Concurrency in the language (asynchronous procedures, callbacks or green threads). The evaluator would have to become asynchronous or a step machine, a rewrite, for apps that do not need it.
- Node's `http` module at the boundary: HTTP would be Node's code rather than the language's own, unlike `json`, which is written in slopersons.
- Reading the socket's file descriptor with `readSync`. Node exposes no supported way to make or reach a blocking socket descriptor, and a non-blocking one only returns `EAGAIN`.
- Waiting connections that keep reading into memory, which would notice clients that leave while queued. A client that shuts down its sending side may still be waiting for an answer, so it cannot be told apart from one that left, and reading ahead costs memory for every queued client.

## Consequences

- One slow or silent client holds up every client behind it. Timeouts limit that, and are their own decision.
- Every socket operation costs a round trip between threads. Reads move up to 64 KiB each, and writes are buffered by the stream, so this is one trip per buffer rather than per line.
- A client beyond the queue limit sees its connection reset, not refused: the kernel has already completed the handshake when the main thread closes it.
- Ctrl-C still kills the process at once, without running end hooks or flushing open streams. Making it behave like `exit` is a separate decision.
- HTTP can now be written in slopersons over `socket` and streams.
