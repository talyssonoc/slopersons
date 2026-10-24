# Put path manipulation in a `path` module

## Status

Accepted

## Context

Building a path to a file next to a program needed joining a directory and a name, and taking the directory of a file, and the standard library had neither. Both could have gone into `file`, but the project owner asked for a separate `path` module: these functions only build strings and never touch the file system, unlike everything in `file`.

## Decision

- A `path` module, implemented in `src/runtime/path.ts` without JavaScript's path functions.
- `path -> path/join part ...` takes one or more parts and puts a single `/` between pieces. A part that starts with `/` replaces everything before it, as in Python's `os.path.join`. `.` and `..` are kept as written.
- `path -> path/parent` returns everything before the last name, as Node's `path.dirname` does. A trailing `/` is ignored, a bare name gives `"."`, and `"/"` gives `"/"`. The tests compare it with `path.posix.dirname`.
- Paths use `/` only.

Rejected:

- Putting `join` and `parent` in `file`: the owner wanted file system operations and string building kept apart.
- Joining as Node's `path.join` does, which keeps an absolute part inside the result (`/a` joined with `/b` is `/a/b`): `path/this-directory -> do -> path/join input` would then misread an absolute path someone typed.
- Normalizing `.` and `..` while joining: the operating system already understands them, and normalizing `..` without looking at the disk gives the wrong answer when a directory is a symbolic link.

## Consequences

- Programs can build paths without string surgery.
- Windows-style paths, with `\` as the separator, are not understood.
