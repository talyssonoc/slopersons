# Never show JavaScript to the person running a program

## Status

Accepted

## Context

The interpreter is written in JavaScript, but a person running a slopersons program is working in slopersons. A JavaScript stack trace, or a message that mentions `undefined` or `TypeError`, describes the interpreter instead of their program, and they can neither read it nor act on it. So whoever runs a slopersons program must never see a JavaScript stack trace or any trace of JavaScript underneath.

## Decision

Every failure, including interpreter bugs and stack exhaustion, is caught by the CLI and printed as `error: <message>` plus `  at <file>:<line>:<col>`. Internal failures print a single internal-error line with no stack trace. Process warnings are suppressed. Error messages never mention JavaScript types or values such as `undefined`, `NaN` or `TypeError`. Exit codes: 1 for program errors, 2 for usage errors, 70 for interpreter bugs. `SLOPERSONS_DEBUG=1` reveals the underlying details for people working on the interpreter.

## Consequences

- Tests assert the absence of JavaScript text on stderr for program errors, internal errors, stack overflow and out-of-memory conditions.
- `process.exit` is never called; `ExitSignal` carries the exit code so buffered output is not lost.
