# Split programs into modules with `use` and `export`

## Status

Accepted

## Context

A program was a single file with no way to share procedures between files. Modules were the last feature deferred from the first design round. Three choices were put to the project owner: how to import, how to reach a module's members, and what a module exposes.

## Decision

- **Importing is a builtin in flow form.** `"./geometry" -> use => geo` loads the file and returns a module value bound like any other value. The path is relative to the importing file (the working directory in the REPL); `.slop` is appended when missing. A file is loaded once per run, keyed by its absolute path, and its top level runs in a fresh top-level scope exactly as a program does. A file that uses itself while loading is a circular import and an error.
- **Members are reached with qualified names.** `geo/area` is one token: a slash between letters joins segments, the same way a hyphen does inside `is-empty`, while `a / b` remains division. A qualified name is a value and a callee but never a binding target or a parameter. `geo/area => area` brings a member into scope; `at`, `has`, `names` and `path` work on module values by string.
- **Exports are explicit.** An `export name name...` statement, allowed only at a file's top level, lists what importers may see. Export lists are resolved after the file has run, so they can sit at the top like a manifest; a name the file never binds is an error. This was the project owner's choice over exporting every top-level binding.
- **Positions carry their file.** Every token records the file it came from, so an error inside a module's procedure, raised long after loading, points at the module. Error values gained `-> file`.

Rejected:

- A keyword import statement: a third statement keyword taking a string, for no gain over a builtin that fits the flow shape.
- Reaching members only through `at`: every qualified call would need parentheses.
- Open imports that drop every exported name into scope: collisions between modules and no way to see where a name comes from.
- Exporting every top-level binding: nothing to write, but helpers become public and renaming one breaks importers.
- Dot access such as `geo.area`: it reads as method-call syntax, which the language deliberately lacks.

## Consequences

- Programs can be split into files and share procedures and values.
- Module members are read-only from the outside; mutable shared state goes through a container the module exports.
- Module namespaces are JavaScript `Map`s, an interpreter-internal structure like environments, and the no-proxy rule records that exception.
- There is no search path and no standard library of `.slop` modules yet; both can be added without changing the surface.
