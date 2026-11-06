# slopersons for VS Code

Language support for `.slop` files:

- a TextMate grammar (`syntaxes/slopersons.tmLanguage.json`) for highlighting;
- a language configuration (`language-configuration.json`) for comments, brackets and margin bars;
- a language client (`src/extension.ts`) that starts `slopersons --lsp` and shows parse errors as you type.

What it does:

- highlights comments, strings with `{}` interpolation and escapes, chars, numbers, keywords, `yes`/`no`/`nothing`, operators, margin bars, procedure declarations and their parameters, inline lambda parameters, the callee after `->`, the name after `=>` and `=>>`, and qualified names (builtin modules such as `io` and `array` get their own scope);
- underlines parse errors from the interpreter's own parser, one per broken top-level statement, without saving or running the file;
- `~` toggles line comments; brackets, quotes and backticks auto-close;
- double-click selects a whole kebab-case or qualified name (`io/print-line`);
- Enter on a line inside a block (`| | x -> f`) starts the next line with the same bars; Enter on a line that holds only bars leaves the block.

## The language server

The extension runs the command in the `slopersons.server.path` setting (default `slopersons`) with `--lsp`. Reload the window after changing it. If the command cannot start, a warning says so and highlighting keeps working.

- **Standalone executable** (recommended): `pnpm build` in `core/` writes `dist/slopersons`, which contains Node. Set `slopersons.server.path` to its absolute path, or put it on your `PATH`.
- **The checkout:** set it to the absolute path of `core/bin/slopersons.mjs`. That script runs with the `node` on VS Code's `PATH`, which must be Node 26, because the interpreter runs its TypeScript sources directly. With asdf, the version comes from the `.tool-versions` nearest to the folder VS Code opened, so a folder outside `core/` may get another Node, and the server fails to start.

## Build, try and install

From this folder:

```
pnpm install
pnpm typecheck
pnpm build                      # dist/extension.js
code --extensionDevelopmentPath="$PWD" ../../docs/examples
pnpm run package                # slopersons-<version>.vsix
code --install-extension slopersons-0.2.0.vsix
```

"Developer: Inspect Editor Tokens and Scopes" shows the scope under the cursor. "Output: slopersons" shows the client's log.

## Tests

In `core/`, `pnpm test` covers what this extension uses:

- `test/vscode-grammar.test.ts` tokenizes with `vscode-textmate` and `vscode-oniguruma`, the engine VS Code uses. Besides targeted cases, it lexes every `.slop` file in the repository with the interpreter's lexer and checks that each token gets a matching scope. It also checks the grammar's keyword, builtin module and bare builtin lists against the lexer and the interpreter.
- `test/lsp.test.ts` checks diagnostic ranges and runs a protocol session against `bin/slopersons.mjs --lsp`. `test/build.test.ts` and `pnpm test:binary` run the same session through the bundle and the executable.

The client code in `src/extension.ts` has no automated test: running it needs a VS Code instance. Check it by hand with the development host above.

## Known limits

A regular-expression grammar sees one line at a time and does not parse:

- The parameters of a lambda are marked only when the bar follows them on the same line (`-> array/each n | ...`, `n | n * 2`). In block form (`-> array/each n` with the body on the next lines), `n` looks like any other name.
- `:` is scoped as the conditional operator, also between a hashmap key and its value.
- `-` is always an operator; the interpreter decides whether it is unary from the spacing.

The language server reports parse errors only. Errors that need running the program, such as an unknown name, show up when it runs. After a lexer error (an unclosed bracket, an unterminated string), it reports only that error until it is fixed.
