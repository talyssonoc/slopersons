# Run programs on a worker thread with a 256 MB stack

## Status

Accepted

## Context

The tree-walking evaluator uses about sixteen JavaScript frames per slopersons call, and the default Node stack fits only about 630 nested calls. Capping recursion at a few hundred would make recursive algorithms unusable.

## Decision

The CLI runs the program in a `worker_threads` Worker with `resourceLimits.stackSizeMb` set to 256, the documented way to get a large stack safely. The interpreter enforces its own limit of 10000 nested calls with a slopersons error, and a JavaScript `RangeError` is still caught at the boundary as a backstop and reported as "recursed too deeply".

Rejected:

- `node --stack-size` in the shebang: it segfaults when the value exceeds the operating system's thread stack.
- A limit of a few hundred calls.

## Consequences

- Tests that exercise the call limit run through the binary; in-process tests stay well below it.
- The worker boundary is also where the heap limit and output handling live.
