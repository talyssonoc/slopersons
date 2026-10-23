# Keep the operating-system calls for files in one boundary module

## Status

Accepted

## Context

The no-proxy rule ([Implement data structures and algorithms instead of wrapping JavaScript](./202610231543-implement-data-structures-and-algorithms-instead-of-wrapping-javascript.md), [Exempt the lexer, parser and CLI from the no-proxy rule](./202610231608-exempt-the-front-end-and-cli-from-the-no-proxy-rule.md)) covers `src/values.ts`, `src/runtime/**` and `src/stdlib/**`, and names `src/cli.ts` as the boundary to the operating system. Files need `node:fs`, standard input had to become a stream that reads bytes in chunks, and the REPL feeds a program's standard input from Node's `readline` on the main thread, one line at a time.

## Decision

- `src/file-system.ts` holds every `node:fs` call made for program files (open, read, write, close, stat, list, remove) and the translation of error codes into messages. Like `src/cli.ts`, it is boundary code.
- `src/runtime/stream.ts` implements buffering, line splitting and modes over a `ByteChannel` interface and never touches Node, so it is tested with in-memory channels. `src/runtime/utf8.ts` does the encoding and decoding.
- The `Io` interface given to the interpreter is `write`, `writeError` and `readInput`, which reads raw bytes from standard input. Reading a line with a prompt, which only the REPL needs, moves to a `ReplIo` interface. In the REPL and in tests, `lineInput` in `src/boundary.ts` turns their line sources into bytes.
- `main` always runs programs and the REPL on the worker; the in-process paths it had for a non-default `Io` had no callers. Tests call `runProgram` and `Repl` directly.
- `test/no-proxy.test.ts` gains a rule: only `src/cli.ts`, `src/worker.ts`, `src/modules.ts` and `src/file-system.ts` import `node:` modules.

Rejected:

- Calling `node:fs` from `src/stdlib/file.ts`: operating-system calls would sit inside the code the no-proxy rule covers, with nothing keeping them in one place.
- Putting file operations on the `Io` interface so tests could swap in an in-memory file system: tests would check the fake rather than the operating system. File tests use real temporary directories instead.
- Keeping standard input line-based through `Io.readLine`: `stream/read-all` could not tell whether input ended with a line break, and invalid UTF-8 would already have been replaced before the stream saw it.

## Consequences

- Moving the language to another runtime means rewriting `src/file-system.ts`, `src/cli.ts`, `src/worker.ts` and `src/modules.ts`, and nothing in `src/runtime` or `src/stdlib`.
- The rule in `test/no-proxy.test.ts` makes a new `node:` import elsewhere fail the build, so widening the boundary is a visible decision.
