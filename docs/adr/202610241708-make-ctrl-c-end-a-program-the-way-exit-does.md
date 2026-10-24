# Make Ctrl-C end a program the way `exit` does

## Status

Accepted

## Context

Ctrl-C used to kill the process at once. Nothing written to a file or a connection but still buffered was written out, and `test` did not print its summary. With the `socket` module ([Make socket calls block by handing them to the main thread](./202610241615-make-socket-calls-block-by-handing-them-to-the-main-thread.md)), a server runs until someone stops it, and Ctrl-C is how it gets stopped. The project owner decided that Ctrl-C should behave like `exit`.

The program runs on a worker thread. When Ctrl-C arrives it may be computing, waiting on the bridge for a socket, waiting for a REPL line, or blocked in `readSync` on standard input. Another thread cannot interrupt `readSync`, so a program waiting for `io/read-line` would only stop at a second Ctrl-C, and every interactive program waits there most of the time.

## Decision

- The main thread handles SIGINT, and in a terminal REPL readline's Ctrl-C. The first one sets a flag in shared memory and cancels whatever the worker is waiting on:
  - a request on the bridge is answered "interrupted", and a request that arrives after the flag is set gets the same answer;
  - the REPL's wait for a line is answered with `LINE_INTERRUPTED`.
- The worker turns either answer into `ExitSignal(130)`. While it computes, the interpreter checks the flag at every procedure call, builtins included, and at every pass of a `while` loop, and throws the same signal. 130 is the shell convention for a process stopped by SIGINT (128 + 2).
- From there it is `130 -> exit`: `attempt` does not catch it, `always` does not run, end hooks run (so `test` prints its summary), and open files and connections are written out and closed.
- Reading standard input moves to the main thread, through the bridge, like sockets. A wait for `io/read-line` can then be cancelled like any other.
- In the REPL, Ctrl-C ends the session with 130, whether an entry is running or the prompt is waiting, as `exit` would.
- A second Ctrl-C restores SIGINT's default action and sends it to the process again. The process ends at once, reported by the shell as ended by the signal (status 130). This also covers a worker stuck in a system call nothing can interrupt, such as opening a named pipe with no writer, where `worker.terminate()` never finishes.
- The bridge module is renamed from `src/network.ts` to `src/bridge.ts`, since it now carries standard input and interruption as well as sockets.

Rejected:

- Keeping the immediate kill. Buffered output would be lost every time a server is stopped.
- Keeping `readSync` for standard input and relying on the second Ctrl-C. Interactive programs, which spend most of their time waiting for input, would need two presses and would lose their buffered output.
- Checking the flag only in loops. A loop written as recursion, or with `array/each` over a long array, would never see it.
- Returning to the prompt in the REPL, as Python's and Node's REPLs do. It is not what `exit` does, and the owner asked for `exit`'s behaviour. It can be revisited separately.
- `worker.terminate()` for the second Ctrl-C. It does not end a thread blocked in a system call.

## Consequences

- Each procedure call and loop pass costs one atomic compare-and-exchange on shared memory.
- A builtin that runs for a long time without calling back into the interpreter, such as sorting a huge array, only stops when it returns.
- Every read of standard input is a round trip to the main thread, in chunks of up to 64 KiB.
- SIGTERM still kills the process at once. Handling it like Ctrl-C would be a separate decision.
