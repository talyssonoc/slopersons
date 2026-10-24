# Free every socket however a program ends

## Status

Accepted

## Context

Since the `socket` module ([Make socket calls block by handing them to the main thread](./202610241615-make-socket-calls-block-by-handing-them-to-the-main-thread.md)), the main thread holds listening sockets, connections and standard input for a program running on the worker thread. Anything the main thread keeps open after the program ends keeps the process alive and the port taken. A bug in the main thread's half of the bridge is worse still: the worker waits in `Atomics.wait` for a reply that never comes, and the process hangs with the port held. No error, bug or missing cleanup may leave a program hanging or a port blocked: a port held by a program that has ended blocks the next run of it, and a hung process has to be found and killed by hand.

## Decision

- When the worker exits, for any reason, `runInWorker` closes the bridge in a `finally`. That closes every listener (which frees its port at once), disconnects every waiting and accepted client, destroys standard input and closes the message port. The worker exits after a normal end, a runtime error, `exit`, Ctrl-C, an internal error, running out of memory, a broken pipe, or `terminate()`.
- A failure on the main thread while it handles a request is caught, and the request is answered with `{ internal }`. The worker turns that into an internal interpreter error (exit code 70), so its normal exit path, and with it the cleanup, runs.
- Any other uncaught exception on the main thread while a program runs, in a socket event for example, prints the internal-error line (with the stack under `SLOPERSONS_DEBUG=1`), sets exit code 70 and terminates the worker, which wakes it even from `Atomics.wait`. The same cleanup then runs. Nobody sees a JavaScript error.
- Tests show this from the outside. For each way a program can end, a test checks four things: the clients are disconnected, the output written before the end arrives, the process exits, and the test can listen on the same port immediately afterwards. The main thread's half of the bridge is also tested in-process. A failure was injected by hand into both the request handler and a socket event, and both ended with exit code 70 and a free port.
- The test suite cannot hang either. `pnpm test` runs with `--test-force-exit`, the network helper kills what failed tests leave behind, the terminal tests kill whole process groups, and every `spawnSync` has a timeout.

Rejected:

- Relying on the operating system freeing sockets when the process exits. It does, but only if the process exits, and a hang is exactly the failure to prevent.
- `process.exit` from the main thread on an internal failure. It skips the worker's cleanup and the flush of buffered output, and invariant 6 rules it out.

## Consequences

- A bug in the bridge shows up as an internal interpreter error instead of a hang.
- An uncaught exception handler is installed for the length of every run. Code added to the main thread later is covered by it, but should not depend on it.
- The ports a program used are free the moment it exits. Listening sockets are opened with address reuse, so connections the server closed and that are still in TIME_WAIT do not block the port.
