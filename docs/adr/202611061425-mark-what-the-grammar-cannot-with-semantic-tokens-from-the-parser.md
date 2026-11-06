# Mark what the grammar cannot with semantic tokens from the parser

## Status

Proposed

## Context

The TextMate grammar in `editors/vscode/` reads one line at a time, so two things it highlights wrongly need the parser:

- A lambda's parameters in block form. In `xs -> array/each n` followed by a margin block, `n` is a parameter only because a block follows, which the grammar cannot see. It marks parameters only when a `|` follows them on the same line.
- The `:` between a hashmap key and its value, which the grammar scopes as the conditional operator.

`slopersons --lsp` ([Serve editors from a language server in the slopersons executable](./202611061211-serve-editors-from-a-language-server-in-the-slopersons-executable.md)) already parses each document with `parseRecovering`. The Language Server Protocol's semantic tokens let a server mark ranges with a type, which editors paint over the grammar's colors when the color theme enables semantic highlighting. The AST kept no position for a lambda parameter or for the `:` of a hashmap entry.

## Decision

The server marks exactly those two things, from the program `parseRecovering` returns:

- every lambda parameter, in all four forms the parser builds, with the standard `parameter` type and the `declaration` modifier;
- every `:` between a hashmap key and its value, with a custom type `keyValueSeparator`, which the extension declares and maps to the TextMate scope `punctuation.separator.key-value.slop`.

It advertises full-document semantic tokens only (no range or delta requests). `Lambda` in `src/ast.ts` gains `parameterPositions`, parallel to `parameters`, and `MapEntry` gains `colon`. Every lambda the parser builds goes through one `lambda` helper in `src/parser.ts`.

Alternatives considered:

- **Mark every name by what it resolves to** (parameters wherever they are used, procedures, modules). It would replace most of the grammar, but it needs a resolver for scopes, `=>`/`=>>` and `use`, which does not exist. It is a later decision.
- **Use the standard `operator` type for the hashmap `:`.** Themes color `operator` like the conditional `:`, so nothing would change on screen.
- **Make `Lambda.parameters` a list of `Name` nodes.** One field instead of two, which cannot fall out of step. But the interpreter copies `lambda.parameters` into procedure values as names (`src/interpreter.ts`), so it would have to map them on every lambda it creates, for an editor feature. With the parallel field, the interpreter is untouched, and the `lambda` helper is the one place that fills both.

## Consequences

- The two gaps close only under a color theme with semantic highlighting on (VS Code's default themes have it on). Otherwise the grammar's colors stay.
- A statement that does not parse gets no semantic tokens, so while a lambda is being typed its parameters fall back to the grammar until the statement parses again. After a lexer error, nothing is marked.
- Uses of a parameter inside the lambda body are not marked, and procedure parameters are left to the grammar, which already marks them on the `proc` line.
- `test/lsp.test.ts` checks each lambda form, lambdas nested in every kind of statement and expression, the hashmap and conditional colons, the encoding, and that every custom token type is declared in `editors/vscode/package.json` with a scope. The protocol session in `test/helpers/language-server.ts` requests tokens from the source checkout, the bundle and the executable.
