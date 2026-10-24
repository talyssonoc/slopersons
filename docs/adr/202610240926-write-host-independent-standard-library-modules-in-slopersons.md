# Write host-independent standard library modules in slopersons

## Status

Accepted

## Context

Every builtin module was TypeScript, registered by `src/stdlib/registry.ts`, and a `.slop` file could only be reached through `use`, relative to the program that loads it. The project owner asked for a `json` module that is always available like the other builtin modules, with no `use`, and written in slopersons. A JSON parser needs nothing from the host: only strings, chars, arrays, hashmaps and errors, all of which the language already has.

## Decision

- A standard library module that needs nothing from the host may be written in slopersons as `src/stdlib/<name>.slop` and registered at the end of `registerStdlib` with `registerSourceModule(interpreter, name, url)` from `src/modules.ts`.
- The file is read and parsed once per process and run once per interpreter, as a module, with its own top-level scope. Its `export` statement decides what becomes public. An exported name the file never binds stops the interpreter from starting.
- Each exported procedure is registered in the builtin module `name` as a builtin with the procedure's exact arity, so `json/parse` prints as `<proc json/parse>`, reports wrong argument counts like any builtin, and is reached the same way as `array/map`. Exported values that are not procedures become value members.
- A runtime error whose position is inside the file is reported at the caller's `->` instead, as [Point builtin errors at the call arrow](./202610231556-point-builtin-errors-at-the-call-arrow.md) does for TypeScript builtins. Errors from procedures the caller passed in keep their own positions.
- The module is loaded whenever an interpreter starts, whether or not the program uses it.

Rejected:

- Writing the JSON parser in TypeScript: it would run much faster, but the owner wanted the module in slopersons, and the parser needs nothing that only TypeScript can provide.
- Shipping it as a library loaded with `use`: the owner wanted it always available, and `use` resolves paths relative to the program, not to the interpreter.
- Loading a source module the first time a program names it: it would need a lazy hook in name lookup. Loading costs about 3 ms once per process (measured on the `json` module) and microseconds per interpreter after that.
- Embedding the source in a TypeScript string: the code would lose its `.slop` file and every brace and quote would need escaping.
- Reporting errors at their position inside the module file: the person running a program would be pointed at a file that is not theirs.

## Consequences

- Modules can move between TypeScript and slopersons without changing how programs call them.
- Code in a source module runs at the interpreter's speed, and its procedure calls count toward the limit of 10000 nested calls, so recursive modules have depth limits that TypeScript builtins do not.
- A bug inside a source module shows up at the caller's position, without the line in the module file; tests of the module have to check messages and results rather than positions inside it.
- Startup reads and parses one more file per source module.
