# Command line

```
slopersons <file.slop> [arguments...]
slopersons --repl
slopersons --version
slopersons --help
```

From a checkout, the command is `./bin/slopersons.mjs`, or `pnpm slopersons <file.slop>` through the package script. pnpm prints its script banner on standard output, so when piping the program's output use `pnpm --silent slopersons <file.slop>`. The `bin` field in `package.json` exposes it as `slopersons` after `pnpm link --global` or an install.

## Program arguments

Everything after the program file is passed to the program, which reads it with `io/arguments -> do` (see [io](stdlib/io.md#arguments)). Interpreter options are recognized only as the first word, so `slopersons tool.slop --help` runs `tool.slop` with `["--help"]` instead of printing this page's usage. A first word that starts with `-` and is not one of the options above is a usage error, and so is anything after `--repl`. In the REPL, `io/arguments -> do` gives `[]`. The package script passes arguments the same way: `pnpm --silent slopersons tool.slop a --help` gives the program `["a" "--help"]`.

## REPL

`slopersons --repl` starts an interactive session. Each entry is parsed and run in one persistent top-level scope, so bindings and procedures carry over.

```
> 5 + 3
-> 8
> 5 => x
-> 5
> proc double n
.. | n * 2
..
> x -> double
-> 10
```

- A line that is a complete statement runs as soon as it is entered.
- A line the parser finds incomplete, such as `proc double n`, `x > 1 ?`, `attempt` or an unclosed bracket, starts a block entry: the prompt changes to `..` and lines are collected until an empty line, then the whole entry runs.
- A line that ends a call with names that are not bound, such as `xs -> array/each n`, also starts a block entry, because those names are almost certainly lambda parameters. Press Enter on an empty line to run it without a block.
- The value of an entry is echoed as `-> value` in the same form `show` uses, so a string appears quoted. `nothing` is not echoed.
- Errors are printed as `error: message` with the position inside the entry, and the session continues.
- Ctrl-C stops the entry that is running, prints `interrupted` on standard error and returns to the prompt; at the prompt it drops what is being typed, including the lines of a block entry. The session goes on either way.
- Ctrl-D leaves with exit code 0; `code -> exit` leaves with that code.

Line editing comes from Node's readline: the arrow keys move within the line and recall earlier entries, and the usual shortcuts work. Up to 200 entries are kept in the session's history. This path is exercised by a test that drives the REPL inside a pseudo-terminal (`test/repl-terminal.test.ts`), not only through pipes.

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | the program finished, or called `0 -> exit` |
| 1 | the program failed with a parse or runtime error, or a file it left open could not be written when it ended |
| 2 | usage error: no file given, an unknown option, words after `--repl`, or the file could not be read |
| 70 | an internal interpreter error; a bug in slopersons, not in the program |
| 130 | Ctrl-C ended the program (see [Ctrl-C](#ctrl-c)) |
| other | the value passed to `exit` |

## Errors

Errors are printed to standard error in slopersons terms only:

```
error: unknown name `totl`
  at examples/sum.slop:4:12
```

Nobody running a slopersons program is ever shown a JavaScript stack trace or a JavaScript error message. An interpreter bug is reported as

```
error: internal interpreter error; this is a bug in slopersons, not in your program
```

and exits with code 70. Setting the environment variable `SLOPERSONS_DEBUG=1` adds the underlying details for people working on the interpreter.

## Input and output

`io/print-line` writes a line to standard output and `io/print` writes without a line break, which is how prompts are shown. `io/read-line -> do` reads one line from standard input and gives `nothing` at end of input; output written before it, including a prompt without a newline, is delivered before the program blocks waiting for input. Output is fully flushed before the process exits, including when `exit` is called. If the reader of standard output goes away early, as in `slopersons report.slop | head`, the program stops quietly with exit code 0.

Standard input is read as UTF-8; bytes that are not valid UTF-8 stop the program with `error: cannot read standard input: it is not valid UTF-8 text (invalid byte at offset N)` unless an `attempt` handles it. Writes to files opened with `file/open` are buffered, and every file a program leaves open is written and closed when it ends, whether it finishes, calls `exit` or stops with an error. If that last write fails, for example because the disk is full, the failure is printed as an `error:` line and a program that would have exited with 0 exits with 1. Relative paths in `file/*` calls are resolved against the directory `slopersons` was started in; `path/this-directory -> do` gives the directory of the program's own file.

## Ctrl-C

Ctrl-C ends a program the way `130 -> exit` does: the program stops where it is, `test` prints its summary, every file and connection it left open is written out and closed, and the process exits with 130. As with `exit`, `attempt` does not catch it and `always` blocks do not run. It works whether the program is computing, waiting for a line of standard input, or waiting on a socket.

In the REPL, Ctrl-C stops only the running entry (see [REPL](#repl)); `attempt` does not catch it and `always` blocks do not run there either.

A second Ctrl-C ends the process at once, without writing anything out. It is for a program that does not stop after the first, which happens when it is stuck in a call the interpreter cannot interrupt, such as opening a named pipe that nothing writes to. The shell then reports the process as ended by the signal, with status 130.

## Execution and limits

The program runs on a worker thread with a large stack so that recursion up to the language's call depth limit (10000 nested calls) works regardless of the platform's default stack size.

Resource exhaustion is reported as a program error, never as a crash:

| Situation | Message |
| --- | --- |
| more than 10000 nested calls | `too many nested procedure calls (the limit is 10000)` |
| a builtin asked to build more than 50000000 elements or characters (`int/up-to`, `string/repeat`, padding) | ````name` would build a value of N ..., which is more than the limit of 50000000``` |
| a string or array outgrows what the interpreter can hold | `a value grew too large for the interpreter to hold` |
| the program's memory exceeds the heap limit (1024 MB by default) | `the program ran out of memory (the limit is 1024 MB)` |

The heap limit can be changed with the environment variable `SLOPERSONS_MAX_HEAP_MB`. Output produced before an out-of-memory failure may be incomplete.

## Standalone executable

`pnpm build` packages the interpreter as a single executable, `dist/slopersons`, using Node's single executable applications. It runs without Node and without the checkout: copy it anywhere and run `slopersons program.slop` as usual, with the same arguments, REPL, exit codes and environment variables (`SLOPERSONS_MAX_HEAP_MB`, `SLOPERSONS_DEBUG`).

- The executable contains Node itself, so it is about 150 MB.
- It is built for the operating system, processor and Node version that run `pnpm build`; there is no cross-compiling. Node tests the feature on macOS on Apple silicon, Linux (except Alpine) and Windows, and still marks it experimental; the build script handles macOS and Linux.
- On macOS the build signs it ad hoc (`codesign --sign -`), which is enough to run it on the machine that built it.

Development does not use this: `./bin/slopersons.mjs` keeps running the TypeScript sources directly.
