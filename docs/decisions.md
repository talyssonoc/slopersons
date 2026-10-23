# Design decisions

Each entry records what was decided, why, and what was rejected. Newer entries go at the bottom of their section. When a decision changes, edit the entry and say what changed rather than deleting history.

## Language shape

### Every statement is a flow that reads left to right

Data on the left, steps on the right, joined by `->`. The piped value becomes the first argument of the procedure it flows into. There is no `f(x)`, no `x.f()`, no `a[i]`; indexing is `-> at i`.

Why: the goal was a syntax whose *shape* is unfamiliar. Glyph-level novelty is impossible (every token exists somewhere), so the distinctiveness budget went into statement shape, call shape and block shape, while arithmetic and literals stayed boring.

Rejected: sentence templates with holes (Inform 7 style, `add 5 to "rent" in budget`), the most distinctive option but user-defined mixfix parsing is a real risk for a first interpreter; prefix fixed-arity syntax (Logo style, `print join "a" b`), simple to parse but reads as a known family and arity errors cascade badly.

### Blocks are margin bars

A line starting with `|` belongs to the header line above it; nesting is `| |`. No closers and no whitespace sensitivity.

Rejected: significant indentation (Python family, whitespace errors), paired delimiters (reads as braces with different glyphs).

### Procedures are first-class values

A bare name is always a value lookup, including when it names a procedure. `numbers -> map double` passes the procedure; `double => d` aliases it. Calls happen only through `->`.

Why: user choice over the recommended "block arguments only" model. The consequence is that zero-input calls need a marker (see `do`).

Rejected: block arguments only (Ruby/Smalltalk blocks, no stored lambdas); no callables at all (stdlib could not offer `map`/`keep`/`sort-by`).

### Zero-input calls go through `do`

`today -> do -> format "yyyy-mm-dd"`. `do` is an ordinary builtin that calls its input with the remaining arguments, so `handler -> do 1 2` also works and `(ops -> at "square") -> do 7` reads well.

Rejected: a leading `-> today` on a line, because a line starting with `->` continues the previous flow and that is the more valuable feature; an empty-source token such as `()` or `_`, because it adds a value to the language for a single use.

### `=>` binds locally, `=>>` updates an existing binding, shadowing is an error

Scopes are created only by the program top level, `proc` bodies and lambda bodies; conditional and loop blocks do not create scopes. `=> name` rebinds within the current scope or creates a local; if the name exists only in an enclosing scope it is an error that points at `=>>`. `=>> name` updates the nearest existing binding, searching from the current scope outward, and errors if none exists. Parameters always create fresh bindings and may shadow.

Why: user chose "always local, explicit marker for outer". The shadowing error was added because `total + n => total` inside an `each` lambda would otherwise silently create a shadow and leave the accumulator unchanged. `=>>` searches from the current scope (not only enclosing ones) because the first test program hit a trap: inside a top-level `while` body `i` is local, so a strict "enclosing only" `=>>` rejected `i + 1 =>> i` while the same line inside an `each` lambda required it. With the lenient rule, `=>>` is always safe for "update this counter wherever it lives" and `=>` is always "this is mine".

Rejected: Ruby-block semantics (update nearest existing binding everywhere), simplest but a proc can silently clobber a global; a hybrid where lambdas share and procs isolate.

### Conventional operator precedence

`*` binds tighter than `+`, comparisons sit below arithmetic, `not` above `and` above `or`. Comparisons cannot be chained (`a < b < c` is a parse error).

Rejected: strict left-to-right evaluation like Smalltalk. It would have required parentheses on every compound condition (`(n > 1) and (n < 10)`) and bought no visible distinctiveness.

### Conditions must be booleans

`?` and `while` accept only `yes` or `no`; any other value is a runtime error. There is no truthiness and no coercion anywhere.

### Missing keys and indexes are errors

`-> at` fails on a missing hashmap key or an out-of-range index. `-> at-or key default` returns a default and `-> has key` checks membership.

Rejected: returning `nothing`, which makes typos silent and forces every consumer to check.

### Conditionals are also expressions

`(n > 1 ? "many" : "one") => label` works because a parenthesized statement may be a conditional, whose value is the value of the taken branch. `while` and `proc` are not values.

## Lexical choices

- Comments start with `~` and run to the end of the line.
- Booleans are `yes` and `no`; the absent value is `nothing`.
- Equality is `=`, inequality is `/=`, since `=` is free (binding uses `=>`).
- Chars are written between backticks: `` `a` ``, `` `\n` ``.
- Names are kebab-case: `is-empty`, `sort-by`. Consequently `a-b` is one name, `a - b` is subtraction, and `a -b` is a parse error (a unary minus followed by an operand where an operator was expected). Spaces around binary operators are mandatory.
- Strings interpolate with `{flow}`; `\{` is a literal brace.
- Ints and floats are distinct types. Ints are arbitrary precision; `/` on two ints floors and `mod` agrees with it (Python semantics); a float operand promotes the result.
- `+` concatenates two strings. No other coercion.

## Parsing rules that resolve ambiguity

All of these error rather than guess.

- **Trailing bare names before a body are lambda parameters.** `xs -> fold start acc n | ...` treats `start` as a parameter; write `fold (start) acc n` to pass a variable. A misparse surfaces as an arity error at call time.
- **An inline lambda body runs to the end of the line or the closing bracket.** A lambda that is not last inside a literal must be parenthesized: `{"double": (n | n * 2)  "square": (n | n * n)}`.
- **An inline then-body ends at the first top-level `:`.** An inline lambda inside a then-body swallows the `:` and the parser reports it with a hint.
- **A nested inline conditional binds `:` to the nearest `?`.**
- **A line whose tokens are only names, followed by a block, is a lambda.** A literal followed by a block is an error.
- **Continuation lines are merged by the parser, not the lexer.** A line starting with `->`, `=>` or `=>>` continues the previous statement at the same depth. Each piece keeps its own block, so in

  ```
  numbers -> keep n
  | n > 10
  -> map n
  | n * 2
  ```

  the first block belongs to `keep` and the second to `map`. Joining the lines in the lexer would have lost which step each block belongs to.
- **Zero-parameter lambdas need parentheses or a call context.** A line cannot start with a lambda bar because leading bars are margins.
- **Brackets span lines.** Inside an open `(`, `[` or `{`, line breaks are whitespace and leading bars are not margins.

## Runtime and implementation

### The interpreter is not a proxy over JavaScript

Data structures and algorithms are implemented in the interpreter: the hash table (compact ordered dict with open addressing), stable merge sort, string search/split/trim/pad over code points, and proleptic Gregorian calendar arithmetic. JavaScript supplies only number and BigInt arithmetic, code point access and `String.fromCodePoint`, per-code-point case mapping and the `\p{L}`/`\p{Nd}`/`\s` classification tables, the clock (`Date.now()` only), and I/O. JS `Date` and `Array.prototype.sort` are allowed in tests as oracles, never in `src/`.

Rejected: reusing `Map`, `Set`, `Array.prototype.sort` and `Temporal` internally (faster to build, but the interpreter would be a wrapper); shipping our own Unicode tables (large effort for no language value).

### Nobody running a `.slop` program ever sees JavaScript

Every failure, including interpreter bugs and stack exhaustion, is caught by the CLI and printed as `error: <message>` plus `  at <file>:<line>:<col>`. Internal failures print as an internal interpreter error without a stack trace. Process warnings are suppressed. Error messages never mention JS types or values (`undefined`, `NaN`, `TypeError`). Exit codes: 1 for program errors, 2 for usage errors, 70 for interpreter bugs.

### Ints are BigInt

Arbitrary precision, no overflow, int and float are different representations. Cost accepted: slower arithmetic loops and conversions wherever an int indexes an array.

Rejected: JS numbers with an int tag (precision loss above 2^53).

### Equality is deep and structural

`=` compares any two values structurally; different types compare unequal rather than erroring. Hashmap keys may be any value and are hashed structurally; mutating a key after insertion is undefined behavior and documented as such.

### `out` exits the nearest enclosing `proc`

Through lambdas, like Ruby's `return` inside a block, so `each n | n = 3 ? n -> out` leaves the procedure. `stop` leaves the innermost loop. `out` reaching a finished activation is an error.

### Dates are calendar dates

No time of day in v1. Stored as days since 1970-01-01, converted with the standard civil-from-days algorithms.

## Toolchain

### TypeScript executed by Node 26 directly

Node 26 strips erasable TypeScript syntax with no flag, so there is no build step. `tsconfig.json` sets `erasableSyntaxOnly` (TypeScript 5.8+) so anything Node could not run fails typecheck instead of failing at load. `tsc --noEmit` is the type checker; Node never type-checks.

### The entry point is `bin/slopersons.mjs`

Extensionless files under a `"type": "module"` package have thrown `ERR_UNKNOWN_FILE_EXTENSION` in Node, so the shebang file keeps its extension and the package `bin` field provides the bare `slopersons` command.

### Tests use `node --test` with an explicit glob

The default test glob's support for `.ts` files could not be confirmed from documentation, so `package.json` passes `test/**/*.test.ts` explicitly. No test framework dependency.

### Name and extension

The language is `slopersons`, programs use `.slop`, the command is `slopersons`.

## Decisions made during implementation

### `stop` is a keyword, `out` is a builtin

A bare name is a value lookup, so a builtin `stop` written alone on a line would never be called. `stop` therefore became a statement keyword. `out` stays a builtin because it always has an input to flow into it (`value -> out`); exiting with no value is `nothing -> out`.

### Builtins shared across types dispatch on the first argument

`length`, `at`, `each`, `contains`, `reverse`, `is-empty`, `min`, `to-string` and similar names exist for several types. Each stdlib module registers its own implementation with `interp.defineMethod(name, type, arity, fn)`, and the interpreter installs one builtin per name that dispatches on the type of the piped value. Using a name with an unsupported type reports which types it works on. Arity is checked per type, so `3 -> min 5` (two numbers) and `[1 2] -> min` (one array) coexist.

Rejected: one module per name with a type switch inside (couples unrelated modules); distinct names per type such as `string-length` (verbose and unlike the flow style).

### Every builtin with a typed receiver is registered through dispatch

The first stdlib modules used plain `defineBuiltin` for names they believed unique to their type and `defineMethod` only for known-shared names. Written concurrently, the modules disagreed about which names were shared (`put`, `keep`, `copy`, `count`), and a plain registration silently replaced a dispatching one depending on registration order. Two changes fixed this for good: registering a name twice, or both plainly and by type, throws at startup; and every builtin whose first argument has a type is registered with `defineMethod`, even when only one type has it today. Plain builtins are only those that accept any value (`print`, `show`, `type-of`, `do`, `out`, `fail`, `exit`) or take no input (`today`, `read-line`). A consequence users see: the wrong receiver is reported as `\`push\` cannot be used with an int; it works on array`, while other arguments keep the `the index of \`at\` must be an int, got a string` form.

### Builtin errors point at the arrow

A runtime error raised inside a builtin carries the position of the `->` that called it, since the builtin itself has no source position. Errors in the evaluator (unknown name, bad operand) point at the offending token.

### Builtins are a fallback namespace

Lookup checks the scope chain first and the builtin table last, and `=>` never treats a builtin as an enclosing binding. So `[1 2] -> length => length` works and hides the builtin within that scope. Without this, common variable names (`sum`, `lines`, `max`, `date`) would collide with the shadowing error.

### Programs run on a worker thread with a 256 MB stack

The tree-walking evaluator uses about sixteen JS frames per slopersons call, and the default Node stack fits only about 630 nested calls. Rather than cap recursion at a few hundred, the CLI runs the program in a `worker_threads` Worker with `resourceLimits.stackSizeMb` set to 256, which is the documented way to get a large stack safely, and the interpreter enforces its own limit of 10000 nested calls with a slopersons error. A JS `RangeError` is still caught at the boundary as a backstop and reported as "recursed too deeply". Tests that exercise the limit run through the binary; in-process tests stay well below it.

Rejected: `node --stack-size` in the shebang (segfaults when it exceeds the OS thread stack); a few-hundred-call limit (unusable for recursive algorithms).

### Continuation lines may also start with `=>` or `=>>`

So a long flow can end with its binding on its own line.

### `print` returns its input

`x -> print -> double` prints `x` and keeps flowing, which is convenient for debugging a pipeline without restructuring it.

### Chars print bare, like strings

`` `a` -> print `` writes `a`. Inside containers and through `show`, chars appear in backticks so that output remains readable as a literal.

### `index-of` returns `nothing` when absent

Missing *keys* are errors because they usually mean a typo, but "not found" is a legitimate answer to a search, so `index-of` and `find` return `nothing` rather than failing. Documented on the string and array pages.

### Mutating builtins return the container

`xs -> push 1 -> push 2` reads naturally only if `push` returns the array. The exception is `pop`, which returns the removed element because that is what callers want.

### Resource exhaustion is a program error

Three layers keep a runaway program from ever showing a V8 message. Builtins that construct values of a requested size (`to`, `repeat`, `pad-left`, `pad-right`) check the size against a 50 million limit first and raise a slopersons error naming the builtin and the size. If a value still outgrows what JavaScript can represent (a string doubled 30 times), the resulting `RangeError` is caught at the CLI boundary and reported as "a value grew too large". And the worker thread runs with `resourceLimits.maxOldGenerationSizeMb` (1024 MB by default, `SLOPERSONS_MAX_HEAP_MB` to change it), so exceeding it terminates the worker with an error event the main thread turns into "the program ran out of memory" instead of the process dying with a fatal heap message.

### The lexer and parser may use JS collections and string methods

The "not a proxy" rule targets language-visible behavior: `src/values.ts`, `src/runtime/**` and `src/stdlib/**`. The lexer and parser operate on source text at compile time and may use `Set`, `startsWith` and friends; `src/cli.ts` is the I/O boundary and may use whatever Node provides. `test/no-proxy.test.ts` encodes exactly this split and fails on new violations.
