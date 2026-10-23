# Open files with one of four mode words

## Status

Accepted

## Context

[Represent open files and the standard streams as stream values](./202610231912-represent-open-files-and-the-standard-streams-as-stream-values.md) left open how a file is opened. The project owner asked for something close to C: an `open` that returns a handle the program passes around, with modes for reading, writing, and reading and writing. The owner left the details to the implementer, asking for something a programmer from another modern language would find unsurprising, and for the language to stay small.

## Decision

`path -> file/open mode` returns a `stream`, and `mode` is one of four words:

- `"read"`: the file must exist; reading starts at the beginning.
- `"write"`: the file is created, or emptied if it exists.
- `"append"`: the file is created if missing; every write goes to its end.
- `"read-write"`: the file must exist and keeps its content; reads and writes share one position that starts at the beginning, a write replaces the bytes at the position, and reads continue after what was written.

These are C's `r`, `w`, `a` and `r+`. `"append"` was added to the three modes the owner listed because, without a way to move the position, it is the only way to add to the end of an existing file through a stream: `"write"` empties the file and `"read-write"` would have to read all of it first.

The handle is the stream value itself, not the operating system's number for the open file.

Rejected:

- C's letters (`"r"`, `"w"`, `"a"`, `"r+"`): the rest of the language spells its names out.
- One function per mode (`file/open-read`, `file/open-write`): four names for one operation, where the owner asked for modes.
- A `"read-write"` that creates a missing file, like C's `w+`: C's `w+` also empties the file, and a mode that both creates and keeps content would be a fifth behaviour to learn.
- Exposing the descriptor as an int, as C's `open` does: any int could be passed where a file is meant, and a closed descriptor's number can be reused by the next open.
- A `stream/seek` to move the position: not needed for reading or writing a file front to back, and `"append"` covers adding to the end.

## Consequences

- An unknown mode is a runtime error that lists the four words.
- Without seeking, `"read-write"` is limited to overwriting at the point reading reached and adding after reading to the end; seeking can be added later as a `stream` function without changing the modes.
- `"write"` empties an existing file when it is opened, before anything is written.
