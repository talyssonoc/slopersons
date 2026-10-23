# Write program output synchronously to the file descriptors

## Status

Accepted

## Context

The worker's `process.stdout` stream sends one chunk to the main thread and waits for an acknowledgement that only the worker's event loop can receive, and that loop never runs while the program is blocked in `read-line`. In an interactive session every prompt after the first stayed stuck in the worker until the program ended.

## Decision

The worker writes to file descriptors 1 and 2 with `writeSync`, pausing briefly and retrying when the descriptor would block, and treating a closed pipe as the quiet exit.

Rejected:

- Flushing before each read: the stream offers no way to force the pending chunk out.
- Moving reads to the main thread and handing lines to the worker through shared memory: far more machinery for the same result.

## Consequences

- A prompt written with `print` is on screen before the program waits for input.
- Standard output and standard error interleave in program order.
- Each `print-ln` is a system call.
