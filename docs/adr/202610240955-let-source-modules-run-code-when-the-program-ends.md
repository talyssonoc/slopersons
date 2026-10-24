# Let source modules run code when the program ends

## Status

Accepted

## Context

A `test` module written in slopersons ([Write host-independent standard library modules in slopersons](./202610240926-write-host-independent-standard-library-modules-in-slopersons.md)) has to print a summary after the last test and make the program exit with a failing code when a test failed. A program has no way to run code once it has finished, and `exit` ends the program on the spot, so calling it at the first failure would skip every test after it. The interpreter already does work of its own when a program ends: it closes the file streams the program left open.

## Decision

- A standard library module written in slopersons may define a top-level procedure named `at-end` with no inputs. Because it is not exported, programs cannot see or call it.
- `registerSourceModule` finds it when the module loads and records it. When a program ends, whether it finished, called `exit` or stopped with an error, or when a REPL session ends, `finishProgram` in `src/boundary.ts` calls each recorded `at-end` and then closes open streams.
- `at-end` returns an int from 0 to 255. It becomes the exit code only when the program would otherwise have exited with 0; an error or an `exit` keeps its own code. A runtime error inside `at-end` is printed and makes a successful program exit with 1.
- No end hooks run after an internal interpreter error.
- An `at-end` that takes inputs, or returns something other than an exit code, is a bug in the module and stops the interpreter.

Rejected:

- An at-exit facility for user programs: nothing outside the standard library has needed one, and it would make the order of output at the end of a program depend on where hooks were registered.
- Keeping test results in TypeScript so `runProgram` could read them: the module would no longer be written in slopersons.
- Exporting a summary procedure that every test file must call at its end: forgetting it would make a failing test file exit with 0.

## Consequences

- A test file needs nothing but its tests to report a summary and fail properly.
- The output of `at-end` comes after everything the program printed, including the message of an error that stopped it.
- A REPL session that ran a failing test exits with 1.
