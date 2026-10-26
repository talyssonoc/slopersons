# Io builtins

Standard input, standard output, standard error, the program's command-line arguments and its environment variables. The three standard streams are [stream](stream.md) values held by this module, `io/stdin`, `io/stdout` and `io/stderr`, and `io/print-line`, `io/print` and `io/read-line` are shortcuts over them, so a program that only talks to the person at the keyboard never needs the `stream` module. Output is written in order and fully flushed before the program ends, including when `exit` is called; see `cli.md` for exit codes and for what happens when the reader of standard output goes away early.

## print-line

`value -> io/print-line`

Writes the human form of `value` and a newline to standard output (`io/stdout`), then returns `value` so it can sit in the middle of a flow. Strings and chars print bare; inside arrays and hashmaps they print quoted. Floats always show a decimal point. The Printing section of `semantics.md` gives the form of every type.

```
"hi" -> io/print-line                   ~ hi
[1 "a" `b` 2.0] -> io/print-line        ~ [1 "a" `b` 2.0]
3 -> io/print-line -> int/to-string     ~ prints 3, flows "3" onward
```

## print

`value -> io/print`

Like `io/print-line` but without the trailing newline, so a prompt can stay on the same line as the answer. Returns `value`.

```
"Name: " -> io/print
io/read-line -> do => name
```

## read-line

`io/read-line -> do`

Reads one line from standard input without its line break. Returns `nothing` at end of input. It takes no input, so it is called through `do`. Output written before it, including a prompt without a newline, is delivered before the program waits. It is `io/stdin -> stream/read-line`: the two read from the same place, so a program can mix them and each line is read once. Input that is not valid UTF-8 is an error.

```
"Name: " -> io/print
io/read-line -> do => name
"hello, {name}" -> io/print-line          ~ with Ada on standard input: Name: hello, Ada
```

## stdin, stdout, stderr

`io/stdin`, `io/stdout`, `io/stderr`

The standard streams, as [stream](stream.md) values rather than procedures, so they are used without `do`. `io/stdin` can only be read and the other two can only be written; writes to them are not buffered. Closing one only flushes it, and they stay open for the whole program.

```
io/stdin -> stream/read-all -> string/lines -> array/length -> io/print-line   ~ the number of lines on standard input
io/stderr -> stream/write-line "warning: empty input"
proc report target | target -> stream/write-line "all good"
io/stdout -> report                                                             ~ all good
```

## arguments

`io/arguments -> do`

Returns the words written after the program file on the command line, as a new array of strings in their original order. The program's own path is not included, and words that look like interpreter options, such as `--help`, arrive unchanged. Returns `[]` when there are none, and always in the REPL. It takes no input, so it is called through `do`. Each call builds a new array, so changing one does not change what the next call returns.

```
~ slopersons greet.slop Ada --loud
io/arguments -> do => given
given -> io/print-line                  ~ ["Ada" "--loud"]
given -> array/at 0 -> io/print-line    ~ Ada
```

## environment

`io/environment -> do`

Returns the environment variables the program was started with, as a new hashmap from names to strings. A variable set to nothing has the value `""`. Names are kept exactly as the operating system gives them, so on Linux and macOS `PATH` and `path` are different variables. The REPL sees the variables of the shell that started it. Variables cannot be changed: each call builds a new hashmap from the ones the program started with, so changing it does not change what the next call returns. It takes no input, so it is called through `do`.

```
~ PORT=3000 slopersons server.slop
io/environment -> do => environment
environment -> hashmap/at-or "PORT" "8080" -> string/to-int -> io/print-line   ~ 3000
environment -> hashmap/has "DEBUG" -> io/print-line                            ~ no
```

`docs/examples/passwords/passwords.slop` takes its settings this way and checks them before using them.
