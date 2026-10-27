# Error builtins

An error value is what `recover` binds when a runtime error happens inside its `attempt` body. It has type `error`, prints as its message, and `show` gives `<error message>`. `error -> fail` raises it again unchanged, which is how a handler passes on an error it does not want; see the Errors section of `semantics.md` for which failures can be caught. Every function on this page requires an error as its input and reports `the input of \`error/message\` must be an error, got an int` otherwise.

```
attempt
| 1 / 0
recover e
| e -> io/print-line                ~ division by zero
| e -> show -> io/print-line        ~ <error division by zero>
| e -> type-of -> io/print-line     ~ error
```

## message

`error -> error/message`

Returns the message as a string.

```
attempt | "boom" -> fail recover e | e -> error/message -> io/print-line   ~ boom
```

## details

`error -> error/details`

Returns the value given to `fail` after the message, or `nothing` for an error raised without one, including every error the interpreter raises itself. Raising the error again with `e -> fail` keeps its details.

```
proc find-issue id
| "issue {id} does not exist" -> fail {"kind": "not-found"  "id": id}

attempt
| 9 -> find-issue
recover e
| (e -> error/details) = nothing ? e -> fail
| e -> error/details -> hashmap/at "kind" -> io/print-line   ~ not-found
```

## line

`error -> error/line`

Returns the line where the error was raised, as an int, or `nothing` when the position is unknown.

## column

`error -> error/column`

Returns the column where the error was raised, as an int, or `nothing` when the position is unknown. Errors raised by a builtin point at the `->` of the call.

```
attempt
| 1 / 0
recover e
| "{e -> error/message} at line {e -> error/line}" -> io/print-line   ~ division by zero at line 2
```

## file

`error -> error/file`

Returns the file the error was raised in, as a string, or `nothing` when unknown. An error raised inside a module names the module's file, so a handler in the main program can tell where a failure came from.

```
"./lib/geometry" -> use => geometry
attempt
| "circle" -> geometry/circle-area
recover e
| e -> error/file -> io/print-line   ~ lib/geometry.slop
```

## to-string

`error -> error/to-string`

The same as `error/message`.
