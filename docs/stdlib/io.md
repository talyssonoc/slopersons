# Io builtins

Standard output and standard input. Output is written in order and fully flushed before the program ends, including when `exit` is called; see `cli.md` for exit codes and for what happens when the reader of standard output goes away early.

## print-line

`value -> io/print-line`

Writes the human form of `value` and a newline to standard output, then returns `value` so it can sit in the middle of a flow. Strings and chars print bare; inside arrays and hashmaps they print quoted. Floats always show a decimal point. The Printing section of `semantics.md` gives the form of every type.

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

Reads one line from standard input without its line break. Returns `nothing` at end of input. It takes no input, so it is called through `do`. Output written before it, including a prompt without a newline, is delivered before the program waits.

```
"Name: " -> io/print
io/read-line -> do => name
"hello, {name}" -> io/print-line          ~ with Ada on standard input: Name: hello, Ada
```
