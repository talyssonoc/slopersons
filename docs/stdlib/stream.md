# Stream builtins

A stream is an open file or one of the standard streams. `file/open` returns one (see [file](file.md)), and `io/stdin`, `io/stdout` and `io/stderr` are the standard ones (see [io](io.md)). These functions live in the `stream` module and take the stream as their piped value: `notes -> stream/read-line`, `log -> stream/write-line "done"`. A procedure that takes a stream works the same whether it is given an open file or `io/stdout`.

Text is UTF-8. Reading bytes that are not valid UTF-8 is an error that names the offset of the first bad byte from the start of the stream; the line that held it is skipped, so a program that handles the error with `attempt` can keep reading.

Writes to a file are buffered. They reach the file when 64 KiB have piled up, on `stream/flush`, on `stream/close`, and when the program ends, whether it finishes, calls `exit` or stops with an error. Reading the same file in the meantime, through `file/read` or another stream, shows only what has reached it. Writes to `io/stdout` and `io/stderr` are not buffered, so they appear in program order alongside `io/print-line`.

A stream prints as `<stream path>` (`<stream stdin>`, `<stream stdout>` and `<stream stderr>` for the standard ones), `type-of` names it `stream`, and it is equal only to itself.

Errors shared by every function below, all runtime errors that `attempt` can handle:

- the input is not a stream: `` the input of `stream/read-line` must be a stream, got a string ``;
- the stream is closed: `cannot read "notes.txt": the stream is closed`;
- its mode does not allow the operation: `cannot write "notes.txt": the stream was opened for reading`, `cannot read standard output: it can only be written`;
- the operating system reports a failure: `cannot write "out.txt": no space left on the device`.

## read-line

`stream -> stream/read-line`

Reads the next line and returns it without its line break, or returns `nothing` at the end of the stream. A `\r` before the `\n` is dropped, and a last line with no line break is returned as it is.

```
"notes.txt" -> file/open "read" => notes
notes -> stream/read-line => line
while line /= nothing
| "> {line}" -> io/print-line
| notes -> stream/read-line =>> line
notes -> stream/close
```

## read-all

`stream -> stream/read-all`

Returns everything from the current position to the end of the stream as one string, exactly as stored, line breaks included. At the end it returns `""`.

```
io/stdin -> stream/read-all -> string/lines -> array/length -> io/print-line   ~ the number of lines on standard input
```

## write

`stream -> stream/write value`

Writes the printed form of `value`, the form `io/print` uses, and returns the stream so writes can be chained.

```
"report.txt" -> file/open "write" -> stream/write "total: " -> stream/write 42 -> stream/close
"report.txt" -> file/read -> io/print-line                                        ~ total: 42
```

## write-line

`stream -> stream/write-line value`

Like `stream/write`, followed by a line break.

```
io/stderr -> stream/write-line "warning: no input"
```

## flush

`stream -> stream/flush`

Hands what is buffered to the operating system and returns the stream, for when something else needs to read the file while the stream stays open.

```
"progress.txt" -> file/open "write" => progress
progress -> stream/write-line "step 1 done" -> stream/flush
"progress.txt" -> file/read -> io/print                                           ~ step 1 done
```

## close

`stream -> stream/close`

Writes what is buffered, closes the file and returns `nothing`. Closing a closed stream does nothing. Closing a standard stream only flushes it: `io/stdin`, `io/stdout` and `io/stderr` stay open for the whole program. Files a program leaves open are closed when it ends, so `close` matters for files that are read back or reopened while the program runs; `always` closes one on every way out of a block.

```
"log.txt" -> file/open "append" => log
attempt
| log -> stream/write-line "started"
| 1 / 0
always
| log -> stream/close
```
