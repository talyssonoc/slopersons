# slopersons for VS Code

Language support for `.slop` files:

- a TextMate grammar (`syntaxes/slopersons.tmLanguage.json`) for highlighting;
- a language configuration (`language-configuration.json`) for comments, brackets and margin bars;
- a language client (`src/extension.ts`) that starts `slopersons --lsp`, for parse errors, semantic tokens, go to definition, references and highlights.

What it does:

- highlights comments, strings with `{}` interpolation and escapes, chars, numbers, keywords, `yes`/`no`/`nothing`, operators, margin bars, procedure declarations and their parameters, inline lambda parameters, the callee after `->`, the name after `=>` and `=>>`, and qualified names (builtin modules such as `io` and `array` get their own scope);
- underlines parse errors from the interpreter's own parser, one per broken top-level statement, without saving or running the file;
- warns about names bound nowhere (`totl` for `total`) and `=>>` with nothing to update, with the message running the program would give;
- marks, from the parser, what the grammar cannot: parameters of procedures and lambdas wherever they are used, lambda parameters in block form, and the `:` between a hashmap key and its value (as `punctuation.separator.key-value.slop`, not the conditional operator);
- completes names in scope at the cursor, builtins and keywords, and after a module and `/` (`io/`, or `geometry/` for a file loaded with `use`) that module's members;
- follows `"./lib/geometry" -> use => geometry` into the module file: F12 on `geometry/area` opens its declaration, F12 on the path opens the file, and a member the module does not export, or a module file that cannot be read, is a warning;
- F12 goes to the declaration of a binding, procedure, parameter or `recover` name in the same file; Shift+F12 lists its references; the cursor on a name highlights its other uses;
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
code --install-extension slopersons-0.7.0.vsix
```

"Developer: Inspect Editor Tokens and Scopes" shows the scope under the cursor. "Output: slopersons" shows the client's log.

## Tests

In `core/`, `pnpm test` covers what this extension uses:

- `test/vscode-grammar.test.ts` tokenizes with `vscode-textmate` and `vscode-oniguruma`, the engine VS Code uses. Besides targeted cases, it lexes every `.slop` file in the repository with the interpreter's lexer and checks that each token gets a matching scope. It also checks the grammar's keyword, builtin module and bare builtin lists against the lexer and the interpreter.
- `test/names.test.ts` checks how names resolve to their declarations. `test/lsp.test.ts` checks diagnostic ranges, semantic tokens, definitions, references, highlights, that the custom token type is declared in this `package.json`, and runs a protocol session against `bin/slopersons.mjs --lsp`. `test/build.test.ts` and `pnpm test:binary` run the same session through the bundle and the executable.

The client code in `src/extension.ts` has no automated test: running it needs a VS Code instance. Check it by hand with the development host above.

## Known limits

A regular-expression grammar sees one line at a time and does not parse:

- The grammar marks a lambda's parameters only when the bar follows them on the same line (`-> array/each n | ...`, `n | n * 2`), and scopes every `:` as the conditional operator. The language server's semantic tokens correct both, but only while the server runs, under a color theme with semantic highlighting on (VS Code's default themes have it), and only for statements that parse: while you type a lambda, its parameters fall back to the grammar.
- `-` is always an operator; the interpreter decides whether it is unary from the spacing.

Completion offers nothing in a file with an unclosed bracket or string except builtins and keywords. Modules are followed only when the path is a literal string given to `use` and bound with `=>` right after it, and only one level deep; references and highlights stay within one file; builtins have no definition. Names resolve in statement order, so a loop that reads a name bound later in its own body is resolved to the outer binding. Unknown names are found in statement order too, so that loop also gets a warning it does not deserve; bind the name before the loop. While a statement does not parse, names that appear in it are not reported. Other runtime errors show up only when the program runs. After a lexer error (an unclosed bracket, an unterminated string), it reports only that error until it is fixed.
