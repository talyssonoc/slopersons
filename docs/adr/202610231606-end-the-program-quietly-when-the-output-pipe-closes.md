# End the program quietly when the output pipe closes

## Status

Accepted

## Context

When the reader of standard output goes away, as in `slopersons report.slop | head`, the next write fails with `EPIPE`.

## Decision

The program stops at its next write and exits 0 with nothing on standard error.

Rejected:

- Exit code 141, which is what a shell reports for a process killed by SIGPIPE: the number is a Unix artifact that means nothing to someone writing slopersons.
- Reporting an error: the program did nothing wrong.

## Consequences

- Piping output into `head` behaves like it does for Unix tools.
