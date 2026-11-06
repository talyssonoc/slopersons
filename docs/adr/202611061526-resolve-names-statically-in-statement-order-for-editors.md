# Resolve names statically in statement order for editors

## Status

Proposed

## Context

`slopersons --lsp` reports parse errors and marks lambda parameters where they are declared ([Mark what the grammar cannot with semantic tokens from the parser](./202611061425-mark-what-the-grammar-cannot-with-semantic-tokens-from-the-parser.md)). Going to a name's definition, listing its references, highlighting the other uses of the name under the cursor, and marking a parameter where it is used all need to know which declaration each name refers to. The interpreter learns that only while a program runs.

The scoping rules are in `AGENTS.md` and `src/interpreter.ts`:

- The top level, each `proc` body and each lambda body are scopes. Conditionals, loops and `attempt` are not.
- `=>` and `proc` bind in the current scope; `=>>` updates the nearest existing binding; `recover name` binds the error in the current scope.
- A binding exists from when its statement runs. A procedure or lambda body runs later, when it is called, and sees what its enclosing scopes hold then.
- `export` names are looked up after the module has run.
- A name bound nowhere falls back to the builtins.

The AST kept positions for expressions but not for the names a statement declares: a procedure's name and parameters, the name after `=>` and `=>>`, the name after `recover`, and exported names.

## Decision

`src/names.ts` resolves every simple name in a parsed program to the declaration it refers to, or to none (a builtin or an unknown name). Statements are read in order. A use sees the declarations before it in its own scope, and the declarations of the enclosing scopes. A procedure or lambda body is resolved once its enclosing scope has been read, so it sees every declaration there, including later ones; this is what lets two procedures call each other. Exports are resolved at the end of their scope. A second `=>` of a name in the same scope, and `=>>`, update the existing binding instead of declaring a new one. For a qualified name `a/b`, only `a` is resolved.

The language server uses it for go to definition, find references, document highlights (declarations and updates as writes, other uses as reads), and to mark every parameter, of procedures and lambdas, where it is declared and where it is used. The AST gains the missing positions as fields beside the names (`namePosition`, `parameterPositions`, `namePositions`, `errorNamePosition`), as `Lambda` already has, so the interpreter is unchanged.

Alternatives considered:

- **Let every use see every declaration in its scope, in any order.** The first version did this. It resolves a read that comes before a local `=>` to that local, while the program reads the outer binding at that point. It also hides a use before definition, which a later check for unknown names must report.
- **Resolve by running the program.** It is exact, but it runs code with effects (files, sockets, input) on every keystroke, and only covers the paths a run takes.
- **Follow qualified names into the files `use` loads.** Going from `geometry/area` to `proc area` in another file needs the server to find and parse that file and follow its `export`s. It is the next step, not part of this one.

## Consequences

- Definition, references and highlights work within one file, for bindings, procedures, parameters and `recover` names. Builtins and qualified-name members have no definition.
- Statement order is an approximation of run order. A loop that reads a name bound later in its own body, which works from the second iteration, resolves to the outer binding or to none. A lambda that runs at once (`array/each`) and reads a name its enclosing scope binds after it resolves to that later binding, though the program fails there.
- Parameters are marked wherever they are used, and procedure parameters too, where the grammar alone marked them on the `proc` line. This replaces two of the limits in [Mark what the grammar cannot with semantic tokens from the parser](./202611061425-mark-what-the-grammar-cannot-with-semantic-tokens-from-the-parser.md).
- A statement that does not parse contributes no declarations, so names it would bind resolve to none until it parses.
- `test/names.test.ts` checks the scoping rules, and that every name left unresolved in the repository's programs is a builtin, except the one name a golden program expects to be unknown. A new statement or expression kind fails the typecheck until the resolver handles it.
- A check for unknown names can be built on the names this leaves unresolved.
