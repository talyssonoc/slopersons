# Command line

```
slopersons <file.slop>
slopersons --version
slopersons --help
```

From a checkout, the command is `./bin/slopersons.mjs`. The `bin` field in `package.json` exposes it as `slopersons` after `pnpm link --global` or an install.

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

`print` writes to standard output. `read-line -> do` reads one line from standard input and gives `nothing` at end of input. Output is fully flushed before the process exits, including when `exit` is called.

## Execution and limits

The program runs on a worker thread with a large stack so that recursion up to the language's call depth limit (10000 nested calls) works regardless of the platform's default stack size.

Resource exhaustion is reported as a program error, never as a crash:

| Situation | Message |
| --- | --- |
| more than 10000 nested calls | `too many nested procedure calls (the limit is 10000)` |
| a builtin asked to build more than 50000000 elements or characters (`to`, `repeat`, padding) | ````name` would build a value of N ..., which is more than the limit of 50000000``` |
| a string or array outgrows what the interpreter can hold | `a value grew too large for the interpreter to hold` |
| the program's memory exceeds the heap limit (1024 MB by default) | `the program ran out of memory (the limit is 1024 MB)` |

The heap limit can be changed with the environment variable `SLOPERSONS_MAX_HEAP_MB`. Output produced before an out-of-memory failure may be incomplete.
