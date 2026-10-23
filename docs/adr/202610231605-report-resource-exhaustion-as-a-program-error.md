# Report resource exhaustion as a program error

## Status

Accepted

## Context

A runaway program can exhaust the heap, overflow a JavaScript string or array, or request an absurd allocation. Left alone, V8 prints a fatal message, which violates the rule that no JavaScript ever reaches the person running a program.

## Decision

Three layers apply. Builtins that construct values of a requested size (`to`, `repeat`, `pad-left`, `pad-right`) check the size against a limit of 50 million first and raise a slopersons error naming the builtin and the size. If a value still outgrows what JavaScript can represent, the resulting `RangeError` is caught at the boundary and reported as "a value grew too large". The worker runs with `resourceLimits.maxOldGenerationSizeMb` (1024 MB by default, `SLOPERSONS_MAX_HEAP_MB` to change it), so exceeding it terminates the worker with an error event the main thread turns into "the program ran out of memory".

## Consequences

- Output produced before an out-of-memory failure may be incomplete.
- The heap limit is configurable, so tests can trigger it quickly.
