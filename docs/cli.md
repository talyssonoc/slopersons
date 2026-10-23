# Command line

```
slopersons <file.slop>
slopersons --repl
slopersons --version
slopersons --help
```

From a checkout, the command is `./bin/slopersons.mjs`, or `pnpm slopersons <file.slop>` through the package script. pnpm prints its script banner on standard output, so when piping the program's output use `pnpm --silent slopersons <file.slop>`. The `bin` field in `package.json` exposes it as `slopersons` after `pnpm link --global` or an install.

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
- Ctrl-D leaves with exit code 0; `code -> exit` leaves with that code.

Line editing comes from Node's readline: the arrow keys move within the line and recall earlier entries, and the usual shortcuts work. Up to 200 entries are kept in the session's history.

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | the program finished, or called `0 -> exit` |
| 1 | the program failed with a parse or runtime error |
| 2 | usage error: no file given, or the file could not be read |
| 70 | an internal interpreter error; a bug in slopersons, not in the program |
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

`io/print-ln` writes a line to standard output and `io/print` writes without a line break, which is how prompts are shown. `io/read-line -> do` reads one line from standard input and gives `nothing` at end of input; output written before it, including a prompt without a newline, is delivered before the program blocks waiting for input. Output is fully flushed before the process exits, including when `exit` is called. If the reader of standard output goes away early, as in `slopersons report.slop | head`, the program stops quietly with exit code 0.

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
