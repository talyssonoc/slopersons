# Semantics

## Values and types

| Type | Written | Mutable | Notes |
| --- | --- | --- | --- |
| `int` | `42` | no | arbitrary precision |
| `float` | `3.5` | no | 64-bit floating point |
| `char` | `` `a` `` | no | one Unicode code point |
| `boolean` | `yes`, `no` | no | |
| `string` | `"text"` | no | indexed by code point |
| `nothing` | `nothing` | no | the absent value |
| `array` | `[1 2]` | yes | ordered |
| `hashmap` | `{"k": 1}` | yes | insertion ordered, any value as key |
| `set` | built with `array/to-set` | yes | insertion ordered |
| `date` | built with `date/make`, `date/parse` or `date/today` | no | calendar date, no time of day |
| `time` | built with `time/make` or `time/parse` | no | time of day, millisecond precision, no zone |
| `datetime` | built with `date/at-time`, `datetime/parse`, `datetime/from-epoch` or `datetime/now` | no | a date with a time, UTC |
| `error` | bound by `recover` | no | a message and the position it was raised at |
| `module` | `use`, or a builtin module name such as `io` | no | read-only exported members |
| `proc` | `proc`, lambdas, builtins | no | first-class |

`type-of` returns these names as strings. There is no type coercion anywhere.

## Arithmetic

- `int` with `int` stays `int`. `/` floors toward negative infinity and `mod` has the sign of the divisor, so `-7 / 2` is `-4` and `-7 mod 2` is `1`, and `a = (a / b) * b + (a mod b)` always holds.
- If either operand is a `float`, the result is a `float`.
- `+` on two strings concatenates them.
- Division or `mod` by zero is an error, for ints and floats alike. Operations that would produce a non-finite float, such as `math/sqrt` of a negative number, are errors.
- Mixing other types (`"a" + 1`, `-"x"`) is an error.

## Equality and ordering

`=` and `/=` compare structurally: two arrays are equal when their elements are, two hashmaps when they hold the same keys with equal values regardless of insertion order. Values of different types are unequal, never an error, so `1 = 1.0` is `no` and `1 = "1"` is `no`. Procedures are equal only to themselves.

`<`, `>`, `<=`, `>=` work between two numbers (int and float mix), two strings or two chars (by code point), two dates, two times, two datetimes, or two arrays (element by element, then by length). Any other pairing is an error; a date and a datetime do not compare.

## Conditions

`?` and `while` accept only `yes` or `no`. There is no truthiness: `0`, `""`, `nothing` and `[]` in a condition are errors.

## Scopes and binding

A scope is created by the program itself, by each call of a `proc`, and by each call of a lambda. Conditional branches and loop bodies do **not** create scopes.

- Parameters create fresh bindings in the call's scope and may shadow outer names.
- `=> name` rebinds `name` if it already exists in the current scope, creates it if it exists nowhere in the current procedure call, and is an **error** if it exists only in an enclosing scope of the *same* procedure call (a lambda shadowing its procedure's local, or a top-level lambda shadowing a top-level name). The error exists so that `total + n => total` inside a lambda cannot silently create a shadow and leave the outer `total` unchanged. A `proc` body is a new call, so it may use any local names regardless of what exists outside it; outer names stay readable and are updated only with `=>>`.
- `=>> name` updates the nearest existing binding, searching from the current scope outward through lambdas and procs up to the program scope. It is an error if no binding exists.
- The bare builtins (`do`, `out`, `fail`, `exit`, `use`, `type-of`, `show`) and the names of the builtin modules (`io`, `array`, `math` and the rest) live in a fallback namespace below the program scope: a user binding may take one of those names without error and hides it within that scope. After `[1 2] => array`, `array/length` is an error, because `array` is now an array, not a module.

A lambda captures the scope it was written in and keeps it alive; a procedure that returns a lambda produces a closure.

## Procedures, `out` and `stop`

A call binds parameters, runs the body and yields the value of the last statement, or `nothing` for a body whose last statement is a definition or loop.

`value -> out` ends the nearest enclosing **`proc`** call with `value`, even when written inside a lambda passed to `array/each` or another builtin. The target is fixed when the lambda is created: if that procedure has already returned, reaching `out` is an error. `out` at the top level is an error.

`stop` ends the innermost `while` or loop builtin: `array/each`, `string/each`, `hashmap/each`, `set/each` or `int/times`. Other builtins let a `stop` pass through to the loop around them. A `stop` whose loop is in a calling procedure is an error: it cannot leave the procedure it is written in.

Calls may nest 10000 deep. Beyond that the program fails with an error naming the limit. Builtins that build large values refuse to build more than 50000000 elements or characters at once, and a program that exhausts memory ends with an error rather than a crash; see `cli.md` for the exact messages.

## Mutation

Arrays, hashmaps and sets are mutable, and builtins that mutate (`array/put`, `array/push`, `array/pop`, `array/insert`, `array/remove-at`, `hashmap/put`, `hashmap/remove`, `set/add`, `set/remove`) change the value in place and return it so flows can continue. Everything else returns a new value. Strings, dates and all primitives are immutable.

A hashmap or set key that is mutated after insertion leaves the container in an undefined state. Use immutable keys or copies.

## Evaluation order

Within a flow, the head is evaluated first, then each step left to right. Within a step, the callee is evaluated, then the arguments left to right, then the call happens. Binary operators evaluate their left operand first; `and` and `or` do not evaluate their right operand when the left one decides the result.

## Printing

`io/print-ln` writes the human form: strings and chars bare, ints as digits, floats always with a decimal point (`2.0`), `yes`/`no`/`nothing` as written, dates as `yyyy-mm-dd`, times as `HH:MM:SS` with `.SSS` only when the milliseconds are not zero, datetimes as `yyyy-mm-ddTHH:MM:SS`, arrays as `[1 2 3]`, hashmaps as `{"a": 1  "b": 2}`, sets as `set[1 2 3]`, procedures as `<proc name>` or `<lambda>` (a builtin under its qualified name, `<proc io/print-ln>`), modules as `<module name>` and errors as their message. Inside containers, strings are quoted and escaped, chars are shown in backticks and errors as `<error message>`. `show` returns that quoted form for any value. String interpolation uses the `io/print-ln` form.

## Modules

`path -> use` resolves the path against the directory of the file being run (the working directory in the REPL), appends `.slop` if the path lacks it, reads the file, and runs its top level in a fresh top-level scope, exactly as a program runs. The result is a value of type `module` whose members are the names the file listed in `export` statements. Exports are resolved when the file finishes running, so an `export` may come before the definitions it names; naming something the file never binds is an error. Everything not exported stays invisible to importers.

A file is loaded at most once per run: a second `use` of the same resolved path returns the same module value without running the file again. A file that, directly or through others, uses itself while loading is a circular import and an error.

`module/name` reads an exported member; the left part must be bound to a module, otherwise the lookup fails naming what it is bound to instead. `module/at`, `module/has`, `module/names` and `module/path` do the same by string. Members are read-only: there is no way to assign into a module.

The standard library is a set of builtin modules (`io`, `int`, `float`, `math`, `char`, `boolean`, `string`, `array`, `hashmap`, `set`, `date`, `time`, `datetime`, `error`, `module`) bound in the fallback namespace, so they need no `use` and can be shadowed like any builtin. They are ordinary module values: `io -> module/names` lists the members, `array/map => map` binds one locally, and `module/path` gives `<builtin io>` since there is no file. `stdlib/core.md` lists what each holds.

Errors raised while a module loads, or later inside its procedures, report the module's file in their position. A module's parse error is reported like any parse error and cannot be caught with `attempt`; a missing file or a missing export is a runtime error and can.

## Errors

A runtime error that nothing handles ends the program: the CLI prints `error: <message>` and `  at <file>:<line>:<col>` to standard error and exits with code 1. `message -> fail` raises an error with a custom message at the position of the call.

`attempt` and `recover` handle errors. When a runtime error happens anywhere inside the `attempt` body, including inside procedures it calls, control moves to the `recover` body with the error bound to the given name as a value of type `error`. The value of the statement is the value of whichever body finished. Neither body is a new scope.

An error value carries the message and the position where it was raised: `e -> error/message`, `e -> error/line`, `e -> error/column`, `e -> error/file`. It prints as its message. `e -> fail` raises it again unchanged, which is how a handler passes on an error it does not want.

Catchable: every runtime error, whether raised by the interpreter (division by zero, a type mismatch, a missing key, an arity mismatch, an unknown name, the call depth limit, a size limit) or by `fail`.

Not catchable: parse errors, since they happen before the program runs; `exit`, `out` and `stop`, which are control flow rather than errors; running out of memory or outgrowing what the interpreter can hold; and interpreter bugs. These pass through `attempt` untouched.

An `always` body runs when control leaves the `attempt` body or the `recover` body, whichever ran last: after a normal finish, after a handled error, before an unhandled error propagates, and before an `out` or a `stop` continues on its way. It does not run when `exit` ends the program or when the interpreter itself fails. Its value is ignored; the statement keeps the value of the body that ran before it. An error raised inside `always` replaces whatever was pending. The bodies share the surrounding scope like the others.
