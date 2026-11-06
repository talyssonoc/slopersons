# Recover from parse errors at top-level statement boundaries

## Status

Accepted

## Context

`parse` in `src/parser.ts` throws a `SlopersonsError` at the first error. That suits running a program, which cannot run anyway, but not an editor. While a file is being edited it is usually broken somewhere, and reporting only the first error hides every error after it.

The lexer and the line tree (`src/line-tree.ts`) work on the whole file. An unclosed bracket or an unterminated string changes how every line after it is read, and a block nested deeper than its header leaves no reliable structure. The parser, though, works on the line tree, where each top-level line and its block of margin lines is already a unit. `parseStatements` merges some lines into the statement above them: lines that start with `:` (else branches), `recover`, `always`, `->`, `=>` and `=>>`.

Finer recovery, inside blocks or within a line, would report more errors at once. It would also need the parser to guess what a broken line meant and carry on, and those guesses could accept or describe code differently from what `slopersons` runs.

## Decision

`parseRecovering` in `src/parser.ts` lexes and builds the line tree as `parse` does. If either fails, it returns that single error. Otherwise it groups the top-level lines into statements, keeping each line that starts with `:`, `recover`, `always`, `->`, `=>` or `=>>` with the statement above it. Each group is parsed with a fresh parser, and every error is collected with the statements that did parse. The language server reports these errors. `parse` stays as it is and running a program still stops at the first error.

Alternatives considered:

- **No recovery:** the editor would show one error at a time, which is what makes errors slow to fix.
- **Recovery inside blocks and lines:** more errors per pass, but it needs the parser to synchronize after a partial statement, with guesses `parse` never makes. The top-level boundary is one the language already draws: a top-level line that is not a continuation always starts a new statement.

## Consequences

- One error per broken top-level statement is reported. A procedure with several broken lines in its body shows only the first.
- After a lexer or margin error, only that error is reported until it is fixed.
- For a file that parses, `parseRecovering` must give the same program as `parse`. `test/parser.test.ts` checks this for every `.slop` file in the repository, and checks that the first recovered error is the one `parse` throws for a set of broken sources. A new kind of continuation line in `parseStatements` needs the same case in `continuesStatementAbove`, or this test fails on any program that uses it.
- One ordering differs. `parse` checks that each `attempt` has a `recover` or an `always` after parsing every statement in a block, so a later statement's error can come first. `parseRecovering` reports both.
