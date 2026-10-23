# Dispatch shared builtin names on the type of the first argument

## Status

Accepted

## Context

`length`, `at`, `each`, `contains`, `reverse`, `is-empty`, `min` and `to-string` exist for several types, and the standard library modules are written independently.

## Decision

Each module registers its implementation with `interp.defineMethod(name, type, arity, fn)`, and the interpreter installs one builtin per name that dispatches on the type of the piped value. Using a name with an unsupported type reports which types it works on. Arity is checked per type, so `3 -> min 5` and `[1 2] -> min` coexist.

Rejected:

- One module per name with a type switch inside: couples unrelated modules.
- Distinct names per type such as `string-length`: verbose and unlike the flow style.

## Consequences

- Modules can be written in parallel without coordinating on shared names.
- Wrong-receiver errors read `` `length` cannot be used with an int; it works on string, array, hashmap, set ``.
