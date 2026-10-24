# Find a file's own directory from where the call is written

## Status

Accepted

## Context

Relative `file/*` paths resolve against the working directory ([Resolve relative file paths against the working directory](./202610241006-resolve-relative-file-paths-against-the-working-directory.md)), so a program could not find a file stored next to its own source. Node solves the same problem with `__dirname`, a variable every module gets. Slopersons has no per-file bindings, but every source position already records the file it comes from.

## Decision

- `path/this-directory -> do` returns the absolute path of the directory holding the file in which the call is written. It reads the file from the position of the call, so inside a module it is the module's directory even when the module's procedure is called from another file.
- With no file, as in the REPL, it returns the working directory, the same base `use` falls back to there.
- It is a procedure with no inputs, called through `do` like `date/today`, because it has to know where it is called from.
- Making the path absolute is the only part that asks the operating system, through `absolutePath` in `src/file-system.ts`.

Rejected:

- A binding such as `this-directory` defined in every file's top-level scope, the way Node defines `__dirname`: it would add the first names that appear in a file without being written there.
- The directory of the file currently running, which the interpreter tracks for `use`: a procedure from a module called by the main program would get the main program's directory.
- Returning the path as written on the command line, which can be relative: it would change meaning if the working directory ever changed during a run, and Node's `__dirname` is absolute too.
- Also offering the file's own path (`__filename`): nothing needs it yet, and `path/this-directory` plus the file's name gives it.

## Consequences

- A program can keep data next to itself: `path/this-directory -> do -> path/join "users.json"`.
- A call to `path/this-directory` bound to a name in one file and invoked in another reports the file where it is invoked, since that is where the `-> do` is written.
