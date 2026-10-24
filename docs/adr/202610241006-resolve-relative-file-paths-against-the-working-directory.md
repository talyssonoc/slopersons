# Resolve relative file paths against the working directory

## Status

Accepted

## Context

The `file` module was built resolving relative paths against the working directory, but the choice was never recorded. The project owner ran the users example from the root of the repository and found `users.json` there instead of next to the program, and asked why. Modules loaded with `use` resolve against the importing file ([Split programs into modules with `use` and `export`](./202610231613-split-programs-into-modules-with-use-and-export.md)), so the two rules differ.

## Decision

- A relative path given to a `file/*` function is resolved against the working directory, the directory `slopersons` was started in, as Python's `open`, Node's `fs` and shell tools do.
- `use` keeps resolving against the importing file, because a module ships with the program that uses it.
- A program that needs a file next to its own source builds the path with `path/this-directory` ([Find a file's own directory from where the call is written](./202610241008-find-a-files-own-directory-from-where-the-call-is-written.md)).

Rejected:

- Resolving `file/*` paths against the program's file: a tool that works on the files someone names, such as `slopersons count.slop notes.txt`, would look for `notes.txt` next to `count.slop` instead of where the person is.

## Consequences

- The same program keeps different data depending on where it is started; the users example says so in its header.
- `use` and `file/*` read the same relative path differently, which `docs/stdlib/file.md` points out.
