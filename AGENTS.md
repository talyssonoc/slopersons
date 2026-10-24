# slopersons

Interpreter and standard library for **slopersons**, a dynamically typed structured programming language whose syntax is a left-to-right flow: data on the left, steps on the right, joined by `->`. Blocks are margin bars (`|`). Procedures are first-class. Programs use the `.slop` extension. The interpreter is TypeScript executed directly by Node 26 with no build step; `pnpm build` packages an optional standalone executable for distribution.

Language reference: `docs/syntax.md`, `docs/semantics.md`, `docs/stdlib/*.md`. Rationale for every design choice: the Architecture Decision Records in `docs/adr/`, indexed in `docs/adr/README.md`. Read the index before proposing a language change; if the change is accepted, record it as a new ADR in the same commit (see the section at the end of this file).

## Commands

```
pnpm install                      # once; Node 26.12.1 via asdf (.tool-versions), pnpm 10
pnpm test                         # node --test over test/**/*.test.ts
pnpm typecheck                    # tsc --noEmit; Node never type-checks, so this is the only type check
pnpm build                        # bundle with esbuild and write the standalone executable dist/slopersons (scripts/build-binary.ts)
pnpm test:binary                  # build the executable in a temp dir and run the golden programs through it (skipped by pnpm test)
./bin/slopersons.mjs file.slop    # run a program through the shebang, no build; words after the file reach it as io/arguments
pnpm slopersons file.slop         # same, as a package script (add --silent when piping; pnpm's banner goes to stdout)
./bin/slopersons.mjs --repl       # interactive session; Ctrl-D leaves
SLOPERSONS_DEBUG=1 ./bin/slopersons.mjs file.slop   # only way to see a JS stack for an internal error
```

## Layout

```
bin/slopersons.mjs      shebang entry; imports src/cli.ts; last-resort catch so no JS error ever escapes
src/cli.ts              argument handling, file reading, the error boundary (runProgram), worker launch (with the main-thread half of the bridge), Ctrl-C: the first sets the shared interrupt flag and cancels what the worker waits on, a second re-raises SIGINT
src/boundary.ts         exit codes, ReplIo (the REPL's line reading with a prompt), BrokenPipe, lineInput (standard input bytes from a line source), finishProgram (end hooks, then closeOpenStreams) and the messages for JS-level failures, shared by cli.ts, worker.ts and repl.ts
src/file-system.ts      the operating-system calls behind files (open, read, write, close, stat, list, remove, rename, making a path absolute) and the translation of OS error codes into messages; with cli.ts, worker.ts, modules.ts and bridge.ts, the only files that import `node:`
src/bridge.ts           what the program's thread asks the main thread to do: sockets (with `node:net`) and reading standard input, so that Ctrl-C can cancel any wait. hostBridge runs on the main thread; bridgedHost, in the worker, sends each request and waits for the reply (Atomics.wait, then receiveMessageOnPort), so these calls block. Also holds the queue of at most 10 clients waiting to be accepted and the shared interrupt flag Ctrl-C sets
src/modules.ts          the `use` builtin (module resolution relative to the importing file, caching, cycle detection), the `module/*` builtins, and `registerSourceModule`, which turns a standard library module written in slopersons into a builtin module
src/repl.ts             the --repl loop: complete lines run at once, incomplete ones collect a block until an empty line; in REPL mode cli.ts reads lines with readline on the main thread and hands them to the worker over shared memory
src/worker.ts           worker-thread entry: runs the program on a 256 MB stack with a heap limit
src/lexer.ts            physical lines -> margin depth + tokens; strings with interpolation segments
src/line-tree.ts        lexed lines -> nested blocks by margin depth
src/parser.ts           recursive descent over the line tree -> AST (src/ast.ts)
src/interpreter.ts      Environment, Interpreter (tree walker), control signals (OutSignal, StopSignal, ExitSignal), arithmetic
src/values.ts           tagged runtime values, equality, hashing, ordering, formatting
src/errors.ts           SlopersonsError with kind, position and file
src/runtime/            hand-built algorithms: hashtable, hashing, sorting, text (code points), calendar, time (time of day, datetime parsing and formatting), path (joining paths and taking their parent), utf8 (encoding and strict decoding), stream (buffered streams over byte channels, the registry of open streams), network (the synchronous `Network` interface the interpreter calls, connections as byte channels, listeners)
src/stdlib/             the builtin modules, one file per type; core.ts holds the bare builtins, `error/*`, the loop builtins and `runIo`, io.ts holds `io/*` and the standard streams, `math/*` lives in int.ts; json.slop and test.slop are the `json` and `test` modules, written in slopersons; registry.ts registers each file with explicit calls
test/                   mirrors src/; test/helpers/ast-print.ts prints ASTs as S-expressions; test/helpers/run.ts runs source in-process
test/no-proxy.test.ts   greps src/ for forbidden JS APIs (invariant 5); extend its rules when adding an allowed exception
test/programs/          golden programs (see "Golden programs" below), run through the real binary
test/helpers/golden.ts  runs the golden programs with any entry point: bin/slopersons.mjs, the bundle (test/build.test.ts) or the executable (test/binary.test.ts)
test/network.test.ts    real sockets through bin/slopersons.mjs: a program's port is the first line it prints, test/helpers/network.ts drives clients and servers and kills whatever a failed test leaves running; test/helpers/fake-network.ts is the in-process `Network` for unit tests
scripts/build-binary.ts bundle() and buildExecutable(): esbuild bundles the worker and the entry point, embedding the worker and every src/stdlib/*.slop as build-time constants, then node --build-sea writes dist/ (git-ignored)
docs/                   language docs, stdlib reference, decisions, examples
```

## Invariants

These hold for every change. They come from the project owner and are not negotiable without updating this file. This file is `AGENTS.md`; `CLAUDE.md` only imports it, so every agent tool reads the same instructions.

1. **No barrel files.** No `index.ts`, no re-export-only modules. `src/stdlib/registry.ts` calls `registerX(interpreter)` functions explicitly.
2. **Erasable TypeScript only.** No enums, namespaces, parameter properties or `import x = require`. `import type` for types (`verbatimModuleSyntax`). Relative imports include the `.ts` extension. `noUncheckedIndexedAccess`, `noUnusedLocals` and `noUnusedParameters` are on: handle `undefined` from index access without `!`, and remove imports that stop being used.
3. **Every change ships with tests.** New builtin: unit test plus a golden program if user-visible. Changed behavior: updated test. Bug fix: regression test. For each test, be able to say what change would make it fail.
4. **No inline comments** unless they explain a non-obvious *why*. No JSDoc banners.
5. **The interpreter is not a proxy over JavaScript.** This applies to everything that implements language-visible behavior: `src/values.ts`, `src/runtime/**`, `src/stdlib/**`. The lexer and parser work on source text and may use JS collections and string methods; `src/cli.ts`, `src/repl.ts`, `src/file-system.ts` and `src/bridge.ts` are the I/O boundary, and the standard library reaches the operating system only through `src/file-system.ts`, the `Io` interface and the `Network` interface (`interpreter.network`). `test/no-proxy.test.ts` enforces the split. Data structures and algorithms are ours: `src/runtime/hashtable.ts` (not `Map`/`Set`), `src/runtime/sorting.ts` (not `Array.prototype.sort`), `src/runtime/text.ts` (not `indexOf`/`split`/`trim`/`pad*`/`replace`/regex), `src/runtime/calendar.ts` (not `Date`/`Temporal`/`Intl`). Allowed from JS: number and BigInt arithmetic, `codePointAt`/`String.fromCodePoint`/`for...of` over strings, per-code-point `toUpperCase`/`toLowerCase`, the `\p{L}`/`\p{Nd}`/`\s` single-code-point tests, `Date.now()` for the clock, stdin/stdout, and typed arrays as byte buffers for I/O (UTF-8 encoding and decoding is ours, in `src/runtime/utf8.ts`). JS `Map` is allowed only for interpreter-internal bookkeeping (environments, module namespaces, the builtin registry), never to hold slopersons values. JS `Date` and `Array.prototype.sort` may be oracles in tests, never in `src/`.
6. **Nobody running a `.slop` program ever sees JavaScript.** All failures go through `SlopersonsError` or the boundary in `src/cli.ts`: program errors print `error: <message>` and `  at file:line:col`, exit 1; usage errors exit 2; interpreter bugs print a one-line internal error with no stack and exit 70. Error messages never mention JS types or values (`undefined`, `NaN`, `TypeError`, `BigInt`). Never call `process.exit`; throw `ExitSignal` so buffered output is not lost. Process warnings are suppressed in `main`.
7. **Decisions are documented when they are made.** Any syntax or semantics choice, including ones made while implementing, gets an ADR in `docs/adr/` (context, the decision with its rejected alternatives, consequences), following the Architecture Decision Records section below. Stdlib behavior is documented in `docs/stdlib/<module>.md` in the same change that adds it.
8. **Spaces around binary operators are mandatory in slopersons source** because names are kebab-case (`a-b` is a name). Keep examples and golden programs consistent with that.
9. **Identifiers are whole words.** No abbreviations in TypeScript names: `interpreter` not `interp`, `position` not `pos`, `environment` not `env`, `context` not `ctx`, `inputs` not `args`, `procedure` not `fn`, `cursor` not `c`, `text` not `s`, `codePoint` not `cp`, `milliseconds` not `ms`, `operator` not `op`, `expression` not `expr`, `value`/`type` not `v`/`t`. This applies to parameters, locals, fields, types and test helpers. Allowed as words: names that are exactly a slopersons type (`int`, `char`), established initialisms (`ast`, `cli`, `io`, `utc`, `iso`, `fnv`), and `i`, `j`, `k` as loop indexes. Slopersons example code may use short names where a program would (`n`, `xs`).

## Language rules the implementation must keep

- A bare name is a value lookup, never a call. Calls happen only via `->`; the piped value is the first argument; a trailing `| params | body` or margin block becomes the last argument.
- `=>` binds in the current scope and errors if the name exists only in an enclosing scope of the same procedure call (lambdas over their procedure's locals); a `proc` body may shadow anything outside the call. `=>>` updates the nearest existing binding searching from the current scope outward. Scopes: top level, `proc` bodies, lambda bodies. Conditionals and loops do not create scopes.
- The fallback namespace below the program scope holds the seven bare builtins (`do`, `out`, `fail`, `exit`, `use`, `type-of`, `show`) and the builtin module names (`io`, `file`, `path`, `stream`, `socket`, `int`, `float`, `math`, `char`, `boolean`, `string`, `array`, `hashmap`, `set`, `date`, `time`, `datetime`, `error`, `module`, `json`, `test`); a user binding may shadow any of them without error. After `[1] => array`, `array/length` reports that `array` is an array, not a module.
- Conditions must be `yes`/`no`. No truthiness, no coercion. `=` is deep structural equality across types; ordering across unrelated types is an error.
- Ints are BigInt; `/` floors, `mod` is floored, a float operand promotes. Division by zero is an error.
- `out` exits the nearest enclosing `proc` through lambdas; `stop` (a keyword statement) exits the innermost `while` or loop builtin (`array/each`, `string/each`, `hashmap/each`, `set/each`, `int/times`); other builtins let it pass through.
- `attempt`/`recover` catch `SlopersonsError`s of kind `runtime` only. Control signals (`OutSignal`, `StopSignal`, `ExitSignal`) and JS errors pass through. A caught error becomes an `error` value; `fail` rethrows one unchanged. An `always` body runs after normal completion, runtime errors, `OutSignal` and `StopSignal`, never after `ExitSignal` or a JS error (`cleanupRuns` in `src/interpreter.ts`).
- Keywords: `proc while stop attempt recover always export yes no nothing and or not mod`.
- Modules: `path -> use` loads a file once per interpreter (cache keyed by absolute path in `src/modules.ts`), runs it with `runModule`, and exposes only names listed in `export` statements. Qualified names `a/b` are lexed as one token; `/` between letters joins, anything else is division. Positions carry their `file`, so errors inside modules point at the module. The standard library is itself a set of module values created with `interpreter.builtinModule` and bound in the fallback namespace; `module/*` works on them and on user modules alike.

## Adding a builtin

1. Decide its module. A function lives in the module of its input's type (`array/length`, `string/length`, `hashmap/length` are three functions), a constructor in the module of the type it builds (`string/from-chars`, `array/to-set`, `date/parse`), and only control flow and inspection stay bare; see `docs/adr/202610231614-organize-the-standard-library-into-modules.md`. Implement it in the file of that module under `src/stdlib/` (`math/*` is in `int.ts`; `io/*` is in `io.ts`; `error/*`, `array/each`, `int/up-to` and `int/times` are in `core.ts`; `module/*` is in `src/modules.ts`). Builtins that touch files, streams or sockets wrap the work in `runIo` from `core.ts`, which turns an `IoFailure` into a runtime error at the call.
2. Register it with `interpreter.defineIn(module, name, arity, implementation)`. `interpreter.builtinModule(name)` creates or returns the builtin module value and `defineIn` calls it, so a new module needs no other registration. `interpreter.defineValueIn(module, name, value)` binds a member that is a value rather than a procedure, used without `do` (today `io/stdin`, `io/stdout` and `io/stderr`). `interpreter.defineMethodIn(module, name, types, arity, implementation)` is only for a member that accepts several receiver types and dispatches on the piped value (today only `math/*` and `date/is-leap-year`); it reports `` `math/abs` cannot be used with a string; it works on int, float `` for the wrong receiver. `interpreter.defineBuiltin(name, arity, implementation)` is only for the bare builtins: `do`, `out`, `fail`, `exit`, `use`, `type-of`, `show`. Registering a member twice, or a bare name that is also a module name, throws at startup so collisions are caught by the first test run. Use the `expect*` helpers in `src/stdlib/core.ts` for argument checks and pass the qualified name in the message (`'the input of \`array/length\`'`) so it reads `` the input of `array/length` must be an array, got a string ``; arity errors read `` `array/each` expects 2 arguments, got 1 `` without extra work. Arity is exact (`2`) or `{ min, max }`. The call sits in the file's `register<Type>` function, already called by `registry.ts`.
3. Document it in `docs/stdlib/<module>.md` with its signature in flow form (`xs -> array/length`) and an example. A new module also gets a row in the table in `docs/stdlib/core.md` and a link in `docs/overview.md`.
4. Add a unit test in `test/stdlib/<type>.test.ts` using the `run` helper from `test/helpers/run.ts`, and a golden program under `test/programs/` if the behavior is user-visible.

A module that needs nothing from the host can be written in slopersons instead, as `json` is. Put it in `src/stdlib/<name>.slop`, `export` its public procedures and values, and register it at the end of `registerStdlib` with `registerSourceModule(interpreter, '<name>', standardSourceModule('<name>'))`. `standardSourceModule` reads the file in a checkout and takes the text the build embedded in the standalone executable, where no source files exist; the build embeds every `src/stdlib/*.slop`, so a new one needs no build change. Each exported procedure becomes a builtin member with exact arity, printed as `<proc name/member>`. Errors raised inside the file are reported at the caller's `->`, so the module checks its inputs itself and fails with messages in the usual form (`` the input of `json/parse` must be a string, got an int ``); errors raised by procedures a caller passes in keep their own positions. The file is parsed once per process and run once per interpreter, and every procedure call inside it counts toward the call depth limit. A source module may also define, without exporting it, a procedure `at-end` with no inputs: the interpreter calls it when the program or the REPL session ends, before open streams are closed, and an int it returns becomes the exit code of a program that would otherwise exit with 0. `test` uses it for its summary.

## Golden programs

A golden program is a complete `.slop` program checked in next to the exact output it must produce. `test/programs.test.ts` runs every `.slop` file in `test/programs/` and `docs/examples/` through the real binary, `bin/slopersons.mjs`, so the worker thread, file descriptors and exit codes are the real ones, and compares the result byte for byte. Unit tests in `test/stdlib/` run in-process with a fake `Io` and cannot catch a bug in that plumbing: a worker that drops the program's arguments fails the `arguments` golden program while every unit test passes.

Next to `name.slop`:

- `name.out`: the expected standard output. Without it, standard output must be empty.
- `name.err`: the expected standard error, with `<file>` standing for the program's absolute path. With it the expected exit code is 1; without it, 0 and an empty standard error.
- `name.in`: standard input, optional.
- `name.args`: command-line arguments, one per line, optional.

At least one of `.out` and `.err` must exist. Each program runs in a fresh temporary working directory, so relative paths in `file/*` calls create files there and never in the repository.

Write a golden program for behavior a person running a program sees: printed forms, error messages and their positions, exit codes, standard input, arguments, files. A program that needs something on the other end of a socket cannot be a golden program, because its output depends on a client and on ports the operating system chooses; `test/network.test.ts` runs those through the same binary and checks what both sides saw. Cover the cases and edge conditions of a builtin with unit tests. Review the expected files by hand before committing them: a golden file states what correct output is, not whatever the interpreter happened to print.

## Working notes

- Lexer and parser edits are easiest to verify with `node --test test/parser.test.ts`; the S-expression printer makes expected ASTs one line each.
- The call depth limit (`MAX_CALL_DEPTH` in `src/interpreter.ts`) exists so deep recursion becomes a slopersons error before the JS stack overflows; the CLI still catches a JS `RangeError` as a backstop.
- `python3` is not available in this environment through asdf; use Node scripts for scripted edits.
- Ctrl-C reaches the program as an `Interruption` (`src/interpreter.ts`): `Interpreter.callValue` and every `while` pass call `take()`, which throws `ExitSignal(130)` once. A builtin that loops for a long time without calling back into the interpreter only sees it when it returns. Waits on the bridge are cancelled by the main thread instead, and the REPL's line wait by `LINE_INTERRUPTED`. `test/interrupt.test.ts` covers each.
- Nothing a program opens may outlive it. When the worker exits, for any reason, `runInWorker` closes the bridge in a `finally`: listeners, waiting and accepted connections, standard input and the message port. A failure on the main thread while a program runs is an internal error: the bridge answers the request it was handling with `{ internal }`, and any other uncaught exception terminates the worker, so the same cleanup runs. `test/network.test.ts` checks that every way a program ends frees its port at once.
- Tests that start processes or sockets must not hang the suite when they fail. `pnpm test` runs with `--test-force-exit`; `test/helpers/network.ts` kills the programs, clients and servers its tests leave behind; the terminal tests start each session in its own process group and kill the group; every `spawnSync` has a timeout.
- `test/repl-terminal.test.ts` drives the REPL inside a pseudo-terminal through the `script` command and skips when it is missing. Keystrokes are relayed through `cat` because macOS implements FIFOs and Node's stdio pipes as sockets, which `script` rejects; output is read from the flushed typescript file (`-t 0`) rather than from stdout. The Linux branch (`script -qefc`) has not been run yet.

## Architecture Decision Records

Architectural decisions are recorded in `docs/adr/`, indexed in `docs/adr/README.md`.

- Before an architectural change (new dependency, data model, module boundaries, infrastructure, cross-cutting patterns), read the index and the relevant ADRs.
- Follow Accepted ADRs. If a requested change conflicts with one, say so and stop for confirmation instead of silently breaking it.
- When your work makes a decision future developers will need the "why" for, or one that is architecturally significant, cross-team, or hard to reverse, write an ADR:
  - copy `docs/adr/template.md` to `docs/adr/$(date +%Y%m%d%H%M)-<decision-slug>.md`, naming the decision, not the topic;
  - status Proposed unless the user has agreed to it;
  - describe the real context and the alternatives considered, not generic pros and cons;
  - add it to the index.
- Don't write ADRs for tiny, temporary, or already-documented decisions.
- Never edit an existing ADR except its status. To change a decision, write a new ADR and set the old one's status to `Superseded by [title](./file.md)`.
- After adding an ADR or changing a status, regenerate the index table from the files.
