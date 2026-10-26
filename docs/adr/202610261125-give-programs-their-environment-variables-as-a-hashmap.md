# Give programs their environment variables as a hashmap

## Status

Proposed

## Context

A program could learn about its surroundings only from its command-line arguments (`io/arguments`) and files. Servers are usually configured through environment variables: the port to listen on, where data lives, and secrets that should not be written in the source or appear in the process list the way arguments do.

The program runs on a worker thread ([Run programs on a worker thread with a 256 MB stack](./202610231558-run-programs-on-a-worker-thread-with-a-256-mb-stack.md)), which Node starts with a copy of the main thread's environment. The standard library does not reach the operating system directly, so that unit tests can run the interpreter in-process with values they choose.

## Decision

- `io/environment -> do` returns the variables as a hashmap from names to strings. `hashmap/at-or "PORT" "8080"`, `hashmap/has` and `hashmap/keys` cover lookups, defaults and listing without builtins of their own.
- The worker reads the variables when the interpreter is created (`processEnvironment` in `src/cli.ts`) and passes them as `InterpreterOptions.environment`, as the arguments are passed. Each call to `io/environment` builds a new hashmap from them, so a program that changes the hashmap changes only its copy.
- Variables cannot be set. A program has no child processes to hand them to, and a setter would make the environment shared state.
- The REPL gets the environment too.

Rejected:

- **A lookup by name** (`"PORT" -> io/environment-variable`, returning a string or `nothing`). It handles only the common case and needs a second builtin to list names, while a hashmap already has every operation.
- **Reading the variables inside the builtin.** Tests could not supply their own without changing the real process environment.
- **Names that ignore case.** Windows treats `Path` and `PATH` as the same variable, but Linux and macOS do not, and the names are kept exactly as the system gives them.

## Consequences

- Secrets in the environment are one `io/print-line` away from the output, as in any language that exposes the environment as a whole.
- A program sees the environment as it was when it started, which is all a program can see anyway, since nothing in slopersons can change it.
- Printing `io/environment -> do` shows the variables in the order Node lists them, which is not sorted.
