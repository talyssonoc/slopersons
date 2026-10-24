# Let `file/rename` replace a file at the new path

## Status

Accepted

## Context

`file/write` empties a file before writing it, so a program that crashes, or is stopped, while saving its state leaves a truncated file behind, and with JSON state the next run cannot even parse it. The usual remedy is to write the new state to a temporary file and rename it over the old one, which the operating system does atomically. The `file` module had no way to rename a file.

## Decision

- `path -> file/rename new-path` takes the path first, like the rest of the [`file` module](./202610231914-put-file-system-operations-in-a-file-module-that-takes-the-path-first.md), and returns `new-path`, so a save fits on one line: `"state.json.tmp" -> file/write text -> file/rename "state.json"`.
- A file at `new-path` is replaced, as the operating system's rename does. Directories can be renamed, and a directory replaces only an empty directory.
- A file never replaces a directory, nor a directory a file. Both cases are checked before the rename so the message names the path in the way on every platform: `cannot rename "a.txt" to "photos": "photos" is a directory`.
- Renaming across file systems fails with `the new path is on a different file system`; nothing is copied.
- Nothing forces data onto the disk. The documented guarantee is that whatever opens `new-path` finds the old file or the new one when both paths are on the same file system, and that it holds through a crash of the program, not through a power loss or a crash of the operating system.

Rejected:

- Refusing to replace an existing file: saving would need a remove and then a rename, leaving a moment with no file at all.
- Copying and deleting across file systems, as `mv` does: the copy is not atomic, so the guarantee the function exists for would vanish without a sign.
- Returning `nothing`, or the old path, which no longer exists.
- Adding a way to force data to disk (`fsync`) in the same change: nobody has needed durability across power loss yet, and it can be added as a `stream` function later.

## Consequences

- Programs can save state so that a crash never leaves a half-written file, and `docs/stdlib/file.md` states the two conditions.
- Moving a file to another file system takes a `file/read` and a `file/write`.
