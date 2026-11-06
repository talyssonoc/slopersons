# Warn about unknown names in the editor without running the program

## Status

Proposed

## Context

A misspelt name (`totl` for `total`) is reported only when the program runs and reaches it, as `unknown name`. A `=>>` with no binding to update fails the same way. `src/names.ts` ([Resolve names statically in statement order for editors](./202611061526-resolve-names-statically-in-statement-order-for-editors.md)) already finds every name that resolves to no declaration in the file. The interpreter looks such a name up among the builtins (`Interpreter.builtinNames()`), and `=>>` never updates a builtin.

The resolver follows statement order, which approximates run order. A loop that reads a name bound later in its own body works from its second iteration, but the resolver leaves that read unresolved. While a file is edited, a statement that does not parse also declares nothing, so names it would bind look unknown elsewhere.

## Decision

The language server reports, besides parse errors:

- every read that resolves to no declaration and is not a builtin, with the interpreter's message, `` unknown name `x` ``;
- every `=>>` that finds no binding to update, builtin or not, with the interpreter's message, `` `=>> x` found no existing binding named `x` ``.

Both are warnings, not errors. A name is not reported when it appears anywhere in a top-level statement that does not parse, including its block lines and string interpolations; `parseRecovering` returns those names as `unparsedNames`. The executable passes the builtin names from an interpreter it creates for that and never runs.

Alternatives considered:

- **Report them as errors.** The resolver's order is an approximation, so a program can run correctly with a report against it. An error would claim it cannot.
- **Report nothing while any statement fails to parse.** No false reports from a broken declaration, but the file is broken most of the time it is being edited, so the warnings would rarely show.
- **Guess what a broken statement declares** (the name after `=>` or `proc` in its tokens). More precise, but it reproduces the parser's rules on tokens the parser just rejected. Skipping every name the statement contains costs only missed warnings until it parses.

## Consequences

- A misspelt name is underlined as it is typed, with the message the program would print.
- A loop that reads a name bound later in its own body gets a warning although it runs. Binding the name before the loop silences it.
- While a statement does not parse, unknown names that also appear in it go unreported.
- Other runtime errors a static check could catch, such as `=>` inside a lambda of a name its procedure already binds, are not reported.
- `test/lsp.test.ts` checks that the repository's programs get no warnings except the unknown name a golden program expects, so a resolver mistake that would report valid code fails it. The protocol session checks that the executable passes the builtins, since without them every `io/...` would be reported.
