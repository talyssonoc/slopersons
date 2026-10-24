# Count `stream/read` in bytes

## Status

Accepted

## Context

Streams could read a line or everything up to the end. Over a connection, "the end" is when the other side stops sending, and an HTTP client that keeps its connection open never does. HTTP marks where a request body ends with a `Content-Length` header, counted in bytes. Slopersons strings count characters (code points), and the language has no bytes type ([Reject invalid UTF-8 when reading text](./202610231946-reject-invalid-utf-8-when-reading-text.md)).

## Decision

`stream -> stream/read count` reads `count` bytes and returns them as text. It returns fewer bytes only when the stream ends first, and `nothing` when the stream is already at its end. A count of 0 returns `""` without reading. The bytes must be valid UTF-8 on their own, so a count that stops inside a character is an invalid UTF-8 error, like any other.

Rejected:

- Counting characters. The protocols that need a counted read, HTTP first, count bytes, and the number of characters in N bytes cannot be known before reading them.
- Reading up to the end of the character the count stops inside. It would return more bytes than asked for, so a protocol reader would lose its place.
- A bytes type returned by a read. It is the right answer for binary data, but nothing needs binary data yet, and text in, text out keeps the HTTP layer simple.

## Consequences

- A reader of `stream/read 5` gets 5 bytes, which may be fewer than 5 characters when the text is not ASCII. The documentation says so.
- Binary bodies, such as image uploads, still cannot be read. They need a bytes type, a separate decision.
- Writing a `Content-Length` needs a string's length in bytes, which a later builtin can provide.
