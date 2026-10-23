# slopersons

Interpreter and standard library for **slopersons**, a dynamically typed structured programming language whose syntax is a left-to-right flow: data on the left, steps on the right, joined by `->`. Blocks are margin bars (`|`). Procedures are first-class. Programs use the `.slop` extension. The interpreter is TypeScript executed directly by Node 26 with no build step.

Language reference: `docs/syntax.md`, `docs/semantics.md`, `docs/stdlib/*.md`. Rationale for every design choice: `docs/decisions.md`. Read `docs/decisions.md` before proposing a language change; if the change is accepted, record it there in the same commit.

## Commands

```
pnpm install                      # once; Node 26.12.1 via asdf (.tool-versions), pnpm 10
pnpm test                         # node --test over test/**/*.test.ts
pnpm typecheck                    # tsc --noEmit; Node never type-checks, so this is the only type check
./bin/slopersons.mjs file.slop    # run a program through the shebang, no build
pnpm slopersons file.slop         # same, as a package script (add --silent when piping; pnpm's banner goes to stdout)
SLOPERSONS_DEBUG=1 ./bin/slopersons.mjs file.slop   # only way to see a JS stack for an internal error
```

## Layout

```
bin/slopersons.mjs      shebang entry; imports src/cli.ts; last-resort catch so no JS error ever escapes
src/cli.ts              argument handling, file reading, the error boundary (runProgram), stdin line reading, worker launch
src/worker.ts           worker-thread entry: runs the program on a 256 MB stack with a heap limit
src/lexer.ts            physical lines -> margin depth + tokens; strings with interpolation segments
src/line-tree.ts        lexed lines -> nested blocks by margin depth
src/parser.ts           recursive descent over the line tree -> AST (src/ast.ts)
src/interpreter.ts      Env, Interpreter (tree walker), control signals (OutSignal, StopSignal, ExitSignal), arithmetic
src/values.ts           tagged runtime values, equality, hashing, ordering, formatting
src/errors.ts           SloError with kind, position and file
src/runtime/            hand-built algorithms: hashtable, hashing, sorting, text (code points), calendar
src/stdlib/             builtins grouped by type; registry.ts registers each module with explicit calls
test/                   mirrors src/; test/helpers/ast-print.ts prints ASTs as S-expressions; test/helpers/run.ts runs source in-process
test/no-proxy.test.ts   greps src/ for forbidden JS APIs (invariant 5); extend its rules when adding an allowed exception
test/programs/          golden .slop programs with .out/.err expectations, run through the real binary
docs/                   language docs, stdlib reference, decisions, examples
```

## Invariants

These hold for every change. They come from the project owner and are not negotiable without updating this file.

1. **No barrel files.** No `index.ts`, no re-export-only modules. `src/stdlib/registry.ts` calls `registerX(interp)` functions explicitly.
2. **Erasable TypeScript only.** No enums, namespaces, parameter properties or `import x = require`. `import type` for types (`verbatimModuleSyntax`). Relative imports include the `.ts` extension. `noUncheckedIndexedAccess`, `noUnusedLocals` and `noUnusedParameters` are on: handle `undefined` from index access without `!`, and remove imports that stop being used.
3. **Every change ships with tests.** New builtin: unit test plus a golden program if user-visible. Changed behavior: updated test. Bug fix: regression test. For each test, be able to say what change would make it fail.
4. **No inline comments** unless they explain a non-obvious *why*. No JSDoc banners.
5. **The interpreter is not a proxy over JavaScript.** This applies to everything that implements language-visible behavior: `src/values.ts`, `src/runtime/**`, `src/stdlib/**`. The lexer and parser work on source text and may use JS collections and string methods; `src/cli.ts` is the I/O boundary. `test/no-proxy.test.ts` enforces the split. Data structures and algorithms are ours: `src/runtime/hashtable.ts` (not `Map`/`Set`), `src/runtime/sorting.ts` (not `Array.prototype.sort`), `src/runtime/text.ts` (not `indexOf`/`split`/`trim`/`pad*`/`replace`/regex), `src/runtime/calendar.ts` (not `Date`/`Temporal`/`Intl`). Allowed from JS: number and BigInt arithmetic, `codePointAt`/`String.fromCodePoint`/`for...of` over strings, per-code-point `toUpperCase`/`toLowerCase`, the `\p{L}`/`\p{Nd}`/`\s` single-code-point tests, `Date.now()` for the clock, stdin/stdout. JS `Map` is allowed only for interpreter-internal bookkeeping (environments, the builtin registry), never to hold slopersons values. JS `Date` and `Array.prototype.sort` may be oracles in tests, never in `src/`.
6. **Nobody running a `.slop` program ever sees JavaScript.** All failures go through `SloError` or the boundary in `src/cli.ts`: program errors print `error: <message>` and `  at file:line:col`, exit 1; usage errors exit 2; interpreter bugs print a one-line internal error with no stack and exit 70. Error messages never mention JS types or values (`undefined`, `NaN`, `TypeError`, `BigInt`). Never call `process.exit`; throw `ExitSignal` so buffered output is not lost. Process warnings are suppressed in `main`.
7. **Decisions are documented when they are made.** Any syntax or semantics choice, including ones made while implementing, gets an entry in `docs/decisions.md` (what, why, rejected alternatives). Stdlib behavior is documented in `docs/stdlib/<module>.md` in the same change that adds it.
8. **Spaces around binary operators are mandatory in slopersons source** because names are kebab-case (`a-b` is a name). Keep examples and golden programs consistent with that.

## Language rules the implementation must keep

- A bare name is a value lookup, never a call. Calls happen only via `->`; the piped value is the first argument; a trailing `| params | body` or margin block becomes the last argument.
- `=>` binds in the current scope and errors if the name exists only in an enclosing scope of the same procedure call (lambdas over their procedure's locals); a `proc` body may shadow anything outside the call. `=>>` updates the nearest existing binding searching from the current scope outward. Scopes: top level, `proc` bodies, lambda bodies. Conditionals and loops do not create scopes.
- Builtins are a fallback namespace: a user binding may shadow a builtin without error.
- Conditions must be `yes`/`no`. No truthiness, no coercion. `=` is deep structural equality across types; ordering across unrelated types is an error.
- Ints are BigInt; `/` floors, `mod` is floored, a float operand promotes. Division by zero is an error.
- `out` exits the nearest enclosing `proc` through lambdas; `stop` (a keyword statement) exits the innermost `while`, `each` or `repeat`.
- Keywords: `proc while stop yes no nothing and or not mod`.

## Adding a builtin

1. Implement it in `src/stdlib/<type>.ts`. Every builtin whose first argument is a typed receiver uses `interp.defineMethod(name, type, arity, fn)`, even if only one type has it today: the interpreter dispatches on the type of the piped value and reports `` `name` cannot be used with an int; it works on string `` for the wrong receiver. `interp.defineBuiltin(name, arity, fn)` is only for builtins that accept any value (`print`, `print-ln`, `show`, `type-of`, `do`, `out`, `fail`, `exit`) or take no input (`today`, `read-line`). Registering a name twice, or both ways, throws at startup so collisions between modules are caught by the first test run. Use the `expect*` helpers in `src/stdlib/core.ts` for argument checks so messages stay uniform. Arity is exact (`2`) or `{ min, max }`.
2. Register it from the module's `register<Type>` function (already called by `registry.ts`).
3. Document it in `docs/stdlib/<type>.md` with its signature in flow form and an example.
4. Add a unit test in `test/stdlib/<type>.test.ts` using the `run` helper from `test/helpers/run.ts`, and a golden program under `test/programs/` if the behavior is user-visible.

## Working notes

- Lexer and parser edits are easiest to verify with `node --test test/parser.test.ts`; the S-expression printer makes expected ASTs one line each.
- The call depth limit (`MAX_CALL_DEPTH` in `src/interpreter.ts`) exists so deep recursion becomes a slopersons error before the JS stack overflows; the CLI still catches a JS `RangeError` as a backstop.
- `python3` is not available in this environment through asdf; use Node scripts for scripted edits.
