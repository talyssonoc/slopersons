# Ship a TextMate grammar inside the interpreter repository

## Status

Proposed

## Context

`.slop` files open as plain text in VS Code. Margin bars, `->` flows and kebab-case names make slopersons hard to read without highlighting: `a-b` is one name and `a - b` a subtraction, `io/print-line` is one qualified name and `a / b` a division, and a `|` is either a block margin or a lambda bar.

VS Code highlights a language in two ways. A TextMate grammar is a JSON file of regular expressions that VS Code applies line by line with no extension code. Semantic tokens come from extension code or a language server that parses the file. slopersons has no parser outside the interpreter, which is TypeScript run by Node 26 with no build step (`src/parser.ts`), while an extension runs inside VS Code's own Node.

What a grammar must agree with lives in this repository: the keyword set (`KEYWORDS` in `src/lexer.ts`), the builtin module names and the bare builtins registered by `src/stdlib/registry.ts` and `src/modules.ts`, and the literal rules in `docs/syntax.md`. Each of these has changed within days of the others (the `password` module was added on 2026-10-26). A grammar kept elsewhere would drift without anything noticing.

## Decision

The VS Code extension lives in `editors/vscode/` in this repository and, for now, is a TextMate grammar (`syntaxes/slopersons.tmLanguage.json`) plus a language configuration, with no extension code.

`test/vscode-grammar.test.ts` runs in `pnpm test` and tokenizes with `vscode-textmate` 9.3.2 and `vscode-oniguruma` 2.0.1 (the versions on npm on 2026-11-06), the libraries VS Code itself uses. It checks the grammar's keyword, module and bare builtin lists against the lexer and the interpreter, and checks every token the lexer reads in the repository's `.slop` files against the scope the grammar gives it. `src/lexer.ts` exports `KEYWORDS` and `Interpreter` gains `builtinNames()` for this.

Alternatives considered:

- **A separate repository for the extension.** It would release on its own schedule, but its keyword and module lists could only be compared with the interpreter by copying them, which is the drift this decision prevents.
- **Semantic tokens or a language server first.** They could mark what a regular expression cannot (the parameters of a block-form lambda, `:` in a hashmap versus an else branch), but they need the parser packaged for VS Code's runtime, a build step the interpreter does not have. The grammar is needed anyway: VS Code shows it before a language server starts, and other editors and GitHub's highlighter read TextMate grammars.
- **`vscode-tmgrammar-test` for the tests.** It reads assertions written as comments in sample files, but its last release was in February 2024, and it would add a second test runner beside `node --test`. Driving `vscode-textmate` directly from a `node --test` file also lets the test call the lexer.
- **Writing the grammar in YAML and converting it to JSON.** Easier to write, but it adds a build step and a generated file that can disagree with its source.

## Consequences

- A new keyword, builtin module or bare builtin fails `pnpm test` until the grammar lists it, and a golden program using new syntax fails it until the grammar can tokenize it.
- The interpreter's development dependencies include `vscode-textmate` and `vscode-oniguruma`, used only by that test.
- A line-at-a-time grammar cannot mark everything; `editors/vscode/README.md` lists the known gaps. Closing them is a later decision about semantic tokens or a language server, which would also decide how to run the parser inside VS Code.
- The extension is installed from a `.vsix` built with `@vscode/vsce`. Publishing it to the Marketplace needs a publisher account and is a separate decision.
