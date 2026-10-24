# Reject invalid UTF-8 when reading text

## Status

Accepted

## Context

Streams read bytes, while slopersons strings are sequences of code points and the language has no byte type. The bytes have to be decoded as UTF-8, and a file or standard input may hold bytes that are not valid UTF-8. Standard input used to be decoded by Node, which replaces invalid bytes with U+FFFD, so a program never learned that its input was damaged.

## Decision

- Decoding is strict. Bytes that never start a sequence, continuation bytes without a lead, overlong forms, encoded surrogates, code points above U+10FFFF and sequences cut off by the end are runtime errors that give the offset of the first bad byte from the start of the stream: `cannot read "photo.jpg": it is not valid UTF-8 text (invalid byte at offset 0)`.
- The same rule applies to standard input.
- When `stream/read-line` hits a bad line it consumes that line before failing, so a program that handles the error can keep reading instead of failing on the same bytes forever.
- Writing encodes strings as UTF-8. A lone surrogate, which slopersons source cannot produce today, is written as U+FFFD.
- A byte order mark is not treated specially; a leading U+FEFF stays in the text.
- The encoder and decoder are written for this project in `src/runtime/utf8.ts`, following [Implement data structures and algorithms instead of wrapping JavaScript](./202610231543-implement-data-structures-and-algorithms-instead-of-wrapping-javascript.md). The tests compare them with the platform's strict decoder.

Rejected:

- Replacing invalid bytes with U+FFFD, as Node does: a program that reads a file and writes it back would corrupt it without any sign. Python, Rust and Java fail when they read text that is not valid in its declared encoding.
- `TextDecoder` with `fatal: true`: language-visible behaviour would come from JavaScript, and its error does not say where the bad byte is.

## Consequences

- `io/read-line` now fails on invalid input where it used to replace it. In the REPL, input still arrives through Node's `readline` on the main thread, which replaces invalid bytes before the program sees them.
- Binary files cannot be read until the language has a byte type.
