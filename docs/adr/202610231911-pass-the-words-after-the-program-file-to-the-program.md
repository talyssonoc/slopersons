# Pass the words after the program file to the program

## Status

Accepted

## Context

The command line took the program file from its first word and dropped everything after it, so a program had no way to receive arguments. It also looked for `--version`, `--help`, `-h` and `--repl` anywhere on the line: `slopersons tool.slop --help` printed the interpreter's usage instead of running the program. File handling was being designed next, and without arguments every path a program works on would have to be written into its source or typed on standard input. So arguments come first, as a change of their own.

## Decision

- `io/arguments -> do` returns the words after the program file as an array of strings, in order, without the interpreter's or the program's path. Each call builds a new array.
- Interpreter options are recognized only as the first word: `--version`, `--help`, `-h`, `--repl`. Everything after the program file belongs to the program unchanged, including words that look like options.
- A first word that starts with `-` and is not an option is a usage error (exit 2) that names it: `error: unknown option --x`.
- `--repl` takes nothing after it; extra words are a usage error. In the REPL, `io/arguments -> do` returns `[]`.

Rejected:

- A bare `arguments` builtin: [Organize the standard library into modules](./202610231614-organize-the-standard-library-into-modules.md) keeps bare names for control flow and inspection.
- A module of its own (`program/arguments`, `process/arguments`) for a single member: `io` already holds the program's other connections to the outside.
- An array stored in the module instead of a procedure: arrays are mutable, so one shared array could be changed by any part of the program and every later reader would see it.
- Including the program's path first, as C's `argv[0]` does: every program that reads its arguments would have to skip it.
- A `--` word to end interpreter options: everything after the file already belongs to the program, and a file whose name starts with `-` can be run as `./-name.slop`.

## Consequences

- `slopersons tool.slop --help` runs `tool.slop` with `["--help"]`.
- `slopersons --repl x.slop`, which used to start the REPL and ignore `x.slop`, and `slopersons -x file.slop`, which used to report `cannot read file -x`, are now usage errors that say what is wrong.
- Golden programs can take arguments from a `.args` file next to them, one per line.
- A program can be given the files it works on once file handling lands.
