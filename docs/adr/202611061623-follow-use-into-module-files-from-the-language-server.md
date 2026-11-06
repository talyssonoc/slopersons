# Follow use into module files from the language server

## Status

Accepted

## Context

A program split over files loads each part with `"./lib/geometry" -> use => geometry` and reaches its exports as `geometry/area`. `src/modules.ts` resolves the path against the directory of the file that loads it, adds `.slop` when it is missing, runs the file, and keeps the names its `export` statements list. A missing file is a runtime error, ``cannot read module "…" (looked for …)``, and so is a member the module does not export, `` module `geometry` has no exported name `aera` `` (`resolveQualified` in `src/interpreter.ts`), which the same message reports for builtin modules such as `io`.

The language server ([Resolve names statically in statement order for editors](./202611061526-resolve-names-statically-in-statement-order-for-editors.md)) resolved names within one file only. It saw only the documents the editor sent it and did not touch the file system.

## Decision

The resolver marks a binding as a module when it is made by `=>` steps directly after a call of the builtin `use` on a literal string path. The server then finds the module's file as a URL relative to the importing document's URL, with `.slop` added when missing, and reads it from the editor's copy when that file is open, from disk otherwise. It parses that file with `parseRecovering` and takes the names its `export` statements list, with their declarations. With that, the server:

- goes from `geometry/area` to `proc area` in the module, and from the path string to the module file;
- completes `geometry/` with the module's exports;
- warns about a member a module does not export, for loaded modules and for builtin modules, and about a module file it cannot read, with the interpreter's messages.

When any document changes, the server checks every open document again, since one may load the one that changed. Disk access stays at the boundary: `src/cli.ts` passes the server a function that reads a file.

Alternatives considered:

- **Run `use` as the interpreter does.** It would give exactly the module the program gets, including modules whose exports are computed. But running a module runs its top level, with whatever effects it has (files, sockets, input), on every keystroke.
- **Follow any expression that evaluates to a path** (a variable, an interpolated string). The resolver would need to evaluate expressions. Every example and test program uses a literal path.
- **Index every `.slop` file in the workspace up front.** It would allow finding references across files, but it costs work proportional to the workspace before anything is asked. Following `use` reads only the files a document loads.

## Consequences

- Programs split over files get the same definition, completion and warnings across files as within one. Finding references and highlights stay within one file.
- A module bound through anything but `"literal" -> use => name` is not followed, and its members are not checked.
- Only one level is followed: `a/b/c`, where a module exports another module, is not checked past `b`.
- A document whose URI is not a `file:` URI (an unsaved editor) loads no modules.
- A module file changed on disk while no document that loads it is open is only seen at the next change to an open document.
- `docs/examples/shapes.slop` reads `geometry/secret` on purpose, inside `attempt`, so `test/lsp.test.ts` expects that one warning for it. `test/module-files.test.ts` checks path resolution, exports, warnings, definitions and completion. A protocol session reads `docs/examples/lib/geometry.slop` from disk and then from an open copy.
