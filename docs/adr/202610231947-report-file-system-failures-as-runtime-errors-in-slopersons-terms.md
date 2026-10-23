# Report file system failures as runtime errors in slopersons terms

## Status

Accepted

## Context

Opening, reading, writing, listing and removing files fail for reasons that come from the operating system: a missing file, a permission, a directory where a file was expected, a full disk. Node reports them as JavaScript errors with messages such as `ENOENT: no such file or directory, open 'x'`, which [Never show JavaScript to the person running a program](./202610231544-never-show-javascript-to-the-person-running-a-program.md) rules out. The owner asked for errors that behave as in a modern language.

## Decision

- Every failure is a runtime error raised at the call, so `attempt` can handle it.
- Messages read `cannot <action> <path>: <reason>`, with the path in its quoted `show` form and a reason in plain words: `cannot open "notes.txt": no such file or directory`, `cannot remove "photos": it is a directory`, `cannot list "notes.txt": it is not a directory`.
- Reasons come from a table of operating-system error codes in `src/file-system.ts`. A code missing from the table is reported as `the operating system reported EXDEV`, which names the system's code but nothing from JavaScript. A path the operating system cannot take at all, such as one containing a zero character, is `the path is not valid`. Any other failure is an interpreter bug and goes through the internal-error path.
- Directories are checked before the operating system is asked, so opening a directory fails at `file/open` on every platform, and `file/remove` refuses directories instead of reporting a platform-specific permission error.
- `file/exists` and `file/is-directory` never fail; a path that cannot be examined answers `no`.
- Misuse of a stream follows the same shape: `cannot write "notes.txt": the stream was opened for reading`.

Rejected:

- Returning `nothing` when a file is missing: [Return `nothing` from searches that find nothing](./202610231603-return-nothing-from-searches-that-find-nothing.md) covers searches, and a missing file is closer to a missing key, which [Fail on missing keys and out-of-range indexes](./202610231524-fail-on-missing-keys-and-out-of-range-indexes.md) makes an error.
- Error values that carry a machine-readable code for the reason: the language has no way yet to declare or match kinds of errors, and `file/exists` covers the common check before an operation.

## Consequences

- A program that needs to tell one reason from another can only compare messages, until error values grow a kind.
- New operating-system codes surface with their code until the table is extended.
