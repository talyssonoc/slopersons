# Architecture Decision Records

This folder is the project's decision log. Each file records one architectural decision: the context that led to it, the decision itself, and its consequences. Commits record *what* changed; ADRs record *why*.

## When to write one

Write an ADR when:

- future developers will need to understand the "why" behind what's being done;
- the decision is architecturally significant, cross-team, or hard to reverse.

Skip it when:

- the decision isn't architectural, or is tiny (minimal-risk, self-contained, single-developer);
- it's already fully covered by an existing standard, policy, or document;
- it's temporary: a workaround, a proof of concept, or an experiment.

An ADR is not a changelog and not a feature spec.

## How to add one

1. Copy `template.md` to `YYYYMMDDHHMM-<decision-slug>.md` (`date +%Y%m%d%H%M`).
2. Name the decision, not the topic: `use-postgresql-as-primary-database`, not `database`. If the name needs "and", split it into two ADRs.
3. Fill in Context, Decision, and Consequences. Start with status Proposed.
4. Add a row to the index below.

## Statuses

| Status | Meaning |
| --- | --- |
| **Proposed** | Under discussion, not yet agreed. |
| **Accepted** | Agreed and in effect. |
| **Rejected** | Considered and turned down. Kept so nobody proposes it again blindly. |
| **Deprecated** | No longer applies, with nothing replacing it. |
| **Superseded** | Replaced by a newer decision. Always links to the ADR that replaced it. |

## ADRs are immutable

Once written, an ADR is not edited. Only its status changes. When a decision changes, write a new ADR that explains the new context, and set the old one's status to `Superseded by [title](./file.md)`. Older code may still follow the earlier decision; the log explains why.

## Index

Regenerate this table from the files rather than editing it by hand:

> Read every ADR in this folder (except `README.md` and `template.md`) and regenerate the table below with the date, a link to each decision, and its current status. For superseded ADRs, link to the ADR that replaced them.

| Date | Decision | Status |
| --- | --- | --- |
| 2026-10-23 | [Record architecture decisions with ADRs](./202610231516-record-architecture-decisions-with-adrs.md) | Accepted |
| 2026-10-23 | [Shape every statement as a left-to-right flow](./202610231517-shape-every-statement-as-a-left-to-right-flow.md) | Accepted |
| 2026-10-23 | [Delimit blocks with margin bars](./202610231518-delimit-blocks-with-margin-bars.md) | Accepted |
| 2026-10-23 | [Make procedures first-class values](./202610231519-make-procedures-first-class-values.md) | Accepted |
| 2026-10-23 | [Call zero-input procedures through `do`](./202610231520-call-zero-input-procedures-through-do.md) | Accepted |
| 2026-10-23 | [Bind locally by default and mark outer updates explicitly](./202610231521-bind-locally-by-default-and-mark-outer-updates-explicitly.md) | Accepted |
| 2026-10-23 | [Use conventional operator precedence](./202610231522-use-conventional-operator-precedence.md) | Accepted |
| 2026-10-23 | [Require boolean conditions](./202610231523-require-boolean-conditions.md) | Accepted |
| 2026-10-23 | [Fail on missing keys and out-of-range indexes](./202610231524-fail-on-missing-keys-and-out-of-range-indexes.md) | Accepted |
| 2026-10-23 | [Allow conditionals as expressions in parentheses](./202610231525-allow-conditionals-as-expressions-in-parentheses.md) | Accepted |
| 2026-10-23 | [Names are kebab-case, so binary operators need spaces](./202610231526-names-are-kebab-case-with-mandatory-spaces-around-operators.md) | Accepted |
| 2026-10-23 | [Distinguish ints from floats, with floored int division](./202610231527-distinguish-ints-and-floats-with-floored-int-division.md) | Accepted |
| 2026-10-23 | [Use `=` for equality and `/=` for inequality](./202610231528-use-equals-for-equality-and-slash-equals-for-inequality.md) | Accepted |
| 2026-10-23 | [Name the boolean literals `yes` and `no`](./202610231529-name-the-boolean-literals-yes-and-no.md) | Accepted |
| 2026-10-23 | [Name the absent value `nothing`](./202610231530-name-the-absent-value-nothing.md) | Accepted |
| 2026-10-23 | [Start comments with `~`](./202610231531-start-comments-with-tilde.md) | Accepted |
| 2026-10-23 | [Write chars between backticks](./202610231532-write-chars-between-backticks.md) | Accepted |
| 2026-10-23 | [Interpolate strings with a flow in braces](./202610231533-interpolate-strings-with-a-flow-in-braces.md) | Accepted |
| 2026-10-23 | [Use `+` for string concatenation and coerce nothing else](./202610231534-use-plus-for-string-concatenation-without-other-coercion.md) | Accepted |
| 2026-10-23 | [Treat trailing bare names before a body as lambda parameters](./202610231535-treat-trailing-bare-names-before-a-body-as-lambda-parameters.md) | Accepted |
| 2026-10-23 | [Run inline lambda bodies to the end of the line](./202610231536-run-inline-lambda-bodies-to-the-end-of-the-line.md) | Accepted |
| 2026-10-23 | [End inline then-branches at the first top-level colon](./202610231537-end-inline-then-branches-at-the-first-top-level-colon.md) | Accepted |
| 2026-10-23 | [Bind an inline else to the nearest conditional](./202610231538-bind-inline-else-to-the-nearest-conditional.md) | Accepted |
| 2026-10-23 | [Read a line of bare names followed by a block as a lambda](./202610231539-read-a-line-of-bare-names-followed-by-a-block-as-a-lambda.md) | Accepted |
| 2026-10-23 | [Merge continuation lines in the parser, not the lexer](./202610231540-merge-continuation-lines-in-the-parser.md) | Accepted |
| 2026-10-23 | [Require parentheses for zero-parameter lambdas outside calls](./202610231541-require-parentheses-for-zero-parameter-lambdas-outside-calls.md) | Accepted |
| 2026-10-23 | [Let brackets span lines without margins](./202610231542-let-brackets-span-lines-without-margins.md) | Accepted |
| 2026-10-23 | [Implement data structures and algorithms instead of wrapping JavaScript](./202610231543-implement-data-structures-and-algorithms-instead-of-wrapping-javascript.md) | Accepted |
| 2026-10-23 | [Never show JavaScript to the person running a program](./202610231544-never-show-javascript-to-the-person-running-a-program.md) | Accepted |
| 2026-10-23 | [Represent ints as BigInt](./202610231545-represent-ints-as-bigint.md) | Accepted |
| 2026-10-23 | [Compare values structurally with deep equality](./202610231546-compare-values-structurally-with-deep-equality.md) | Accepted |
| 2026-10-23 | [Make `out` exit the nearest enclosing `proc`](./202610231547-make-out-exit-the-nearest-enclosing-proc.md) | Accepted |
| 2026-10-23 | [Model dates as calendar dates without time](./202610231548-model-dates-as-calendar-dates-without-time.md) | Accepted |
| 2026-10-23 | [Run TypeScript directly on Node 26 without a build step](./202610231549-run-typescript-directly-on-node-26-without-a-build-step.md) | Accepted |
| 2026-10-23 | [Ship the entry point as `bin/slopersons.mjs`](./202610231550-ship-the-entry-point-as-bin-slopersons-mjs.md) | Accepted |
| 2026-10-23 | [Run tests with `node --test` and an explicit glob](./202610231551-run-tests-with-node-test-and-an-explicit-glob.md) | Accepted |
| 2026-10-23 | [Name the language slopersons, with the `.slop` extension](./202610231552-name-the-language-slopersons-with-the-slop-extension.md) | Accepted |
| 2026-10-23 | [Make `stop` a keyword statement](./202610231553-make-stop-a-keyword-statement.md) | Accepted |
| 2026-10-23 | [Dispatch shared builtin names on the type of the first argument](./202610231554-dispatch-shared-builtin-names-on-the-type-of-the-first-argument.md) | Accepted |
| 2026-10-23 | [Register every typed-receiver builtin through dispatch](./202610231555-register-every-typed-receiver-builtin-through-dispatch.md) | Accepted |
| 2026-10-23 | [Point builtin errors at the call arrow](./202610231556-point-builtin-errors-at-the-call-arrow.md) | Accepted |
| 2026-10-23 | [Make builtins a fallback namespace](./202610231557-make-builtins-a-fallback-namespace.md) | Accepted |
| 2026-10-23 | [Run programs on a worker thread with a 256 MB stack](./202610231558-run-programs-on-a-worker-thread-with-a-256-mb-stack.md) | Accepted |
| 2026-10-23 | [Allow continuation lines to start with a binding](./202610231559-allow-continuation-lines-to-start-with-a-binding.md) | Accepted |
| 2026-10-23 | [Name the output builtins `print` and `print-ln`](./202610231600-name-the-output-builtins-print-and-print-ln.md) | Accepted |
| 2026-10-23 | [Return the input from `print-ln`](./202610231601-return-the-input-from-print-ln.md) | Accepted |
| 2026-10-23 | [Print chars bare, like strings](./202610231602-print-chars-bare-like-strings.md) | Accepted |
| 2026-10-23 | [Return `nothing` from searches that find nothing](./202610231603-return-nothing-from-searches-that-find-nothing.md) | Accepted |
| 2026-10-23 | [Return the container from mutating builtins](./202610231604-return-the-container-from-mutating-builtins.md) | Accepted |
| 2026-10-23 | [Report resource exhaustion as a program error](./202610231605-report-resource-exhaustion-as-a-program-error.md) | Accepted |
| 2026-10-23 | [End the program quietly when the output pipe closes](./202610231606-end-the-program-quietly-when-the-output-pipe-closes.md) | Accepted |
| 2026-10-23 | [Write program output synchronously to the file descriptors](./202610231607-write-program-output-synchronously-to-the-file-descriptors.md) | Accepted |
| 2026-10-23 | [Exempt the lexer, parser and CLI from the no-proxy rule](./202610231608-exempt-the-front-end-and-cli-from-the-no-proxy-rule.md) | Accepted |
| 2026-10-23 | [Add time and datetime types](./202610231609-add-time-and-datetime-types.md) | Accepted |
| 2026-10-23 | [Handle errors with `attempt` and `recover`](./202610231610-handle-errors-with-attempt-and-recover.md) | Accepted |
| 2026-10-23 | [Add a REPL that collects blocks until an empty line](./202610231611-add-a-repl-that-collects-blocks-until-an-empty-line.md) | Accepted |
