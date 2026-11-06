# Rename only when every name keeps its meaning

## Status

Accepted

## Context

The language server knows every occurrence of a binding in a file ([Resolve names statically in statement order for editors](./202611061526-resolve-names-statically-in-statement-order-for-editors.md)), so it can rename one. A rename that changes only text can still change the program:

- The new name can capture a use: renaming a lambda parameter `n` to `total` inside a lambda that reads an outer `total` makes that read see the parameter.
- The new name can shadow a builtin a scope still uses: a variable renamed to `io` hides `io/print-line` after it.
- An exported name is also used by every file that loads its module, as `module/name`. The server follows `use` from a file to its modules ([Follow use into module files from the language server](./202611061623-follow-use-into-module-files-from-the-language-server.md)), but not from a module back to the files that load it.
- A statement that does not parse declares and uses nothing as far as the resolver knows, so its occurrences would be missed.

## Decision

Rename (F2) applies to names declared in a file of the program: bindings, procedures, parameters and `recover` names, from any of their occurrences, and to an exported name from `module/name` in a file that loads the module.

For an exported name, the server also renames `module/name` in every file that loads that module. It finds them by reading every `.slop` file under the editor's workspace folders, except in hidden folders and `node_modules`, and the open documents, and keeping the members whose `use` path resolves to the module's file. `src/cli.ts` lists the files and passes the listing to the server.

The rename is refused, with the reason, when:

- a statement that does not parse mentions the name;
- for an exported name, a workspace file that mentions `/name` does not parse;
- the new name is not a name or is a keyword;
- the rename would change what any name in the declaring file refers to. The server renames a copy, resolves it again, and compares what each occurrence refers to, by the first occurrence of its binding or as a builtin, with the original.

Alternatives considered:

- **Refuse to rename exported names.** Safe, but it leaves the one rename that spans files to be done by hand, which is where a missed occurrence is likeliest.
- **Rename only in open documents.** No file system walk, but files that are not open would still use the old name and fail when run.
- **Check captures with rules** (does the new name exist in an enclosing scope, is it a builtin used below). Each rule needs the scoping logic the resolver already has, and misses cases the comparison catches, such as a builtin read in a nested procedure.

## Consequences

- A rename never changes what a program does within the declaring file, and keeps every `module/name` in the workspace pointing at the renamed export.
- Files outside the workspace folders that load the module, a module bound through anything but `"literal" -> use => name`, and `module/at` with the name as a string are not updated.
- Shadowing a builtin is allowed when nothing in that scope uses it.
- Renaming an exported name reads every `.slop` file in the workspace, once per rename.
- `test/rename.test.ts` checks renames within a file and across files and each refusal; `test/workspace-files.test.ts` checks which files the workspace holds; a protocol session renames an export of `docs/examples/lib/geometry.slop` with `shapes.slop` closed, so it is found on disk.
