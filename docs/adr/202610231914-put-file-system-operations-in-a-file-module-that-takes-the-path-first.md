# Put file system operations in a `file` module that takes the path first

## Status

Accepted

## Context

With open files represented as streams ([Represent open files and the standard streams as stream values](./202610231912-represent-open-files-and-the-standard-streams-as-stream-values.md)), operations that start from a path still need a home: opening a file, and convenience calls that read or write a whole file, check whether a path exists, remove a file or list a directory. The first proposal called the module `fs`, after Node and the Unix tradition, and piped the content into the writing functions (`text -> fs/write "out.txt"`), the way `io/print` takes the data.

## Decision

- The module is `file`.
- Every member takes the path as its piped value: `"notes.txt" -> file/read`, `"out.txt" -> file/write text`, `"log.txt" -> file/append line`, `"notes.txt" -> file/exists`. Opening a file for streaming starts the same way, from the path. The exact set of members is settled when the module is implemented.

Rejected:

- `fs`: an abbreviation, where the rest of the standard library spells its names out (`hashmap`, `datetime`, `boolean`).
- Piping the content into the writing functions: it reads as a flow from data to destination, like `io/print`, but the module's piped value would then be a path for some members and the content for others. Taking the path first keeps the module like every other one, where the piped value is the thing the function works on.

## Consequences

- A write cannot be the last step of the flow that builds the text. The text is bound to a name first, or passed in parentheses: `"out.txt" -> file/write (lines -> array/join "\n")`.
- Like `io` and `math`, `file` is not named after a type of value; its members work on paths in the file system.
- The stream type and its module keep the name `stream`, so `file` stays free for path operations.
