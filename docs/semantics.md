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
| `set` | built with `to-set` | yes | insertion ordered |
| `date` | built with `date` or `to-date` | no | calendar date, no time of day |
| `proc` | `proc`, lambdas, builtins | no | first-class |

`type-of` returns these names as strings. There is no type coercion anywhere.

## Arithmetic

- `int` with `int` stays `int`. `/` floors toward negative infinity and `mod` has the sign of the divisor, so `-7 / 2` is `-4` and `-7 mod 2` is `1`, and `a = (a / b) * b + (a mod b)` always holds.
- If either operand is a `float`, the result is a `float`.
- `+` on two strings concatenates them.
- Division or `mod` by zero is an error, for ints and floats alike. Operations that would produce a non-finite float, such as `sqrt` of a negative number, are errors.
- Mixing other types (`"a" + 1`, `-"x"`) is an error.

## Equality and ordering

`=` and `/=` compare structurally: two arrays are equal when their elements are, two hashmaps when they hold the same keys with equal values regardless of insertion order. Values of different types are unequal, never an error, so `1 = 1.0` is `no` and `1 = "1"` is `no`. Procedures are equal only to themselves.

`<`, `>`, `<=`, `>=` work between two numbers (int and float mix), two strings or two chars (by code point), two dates, or two arrays (element by element, then by length). Any other pairing is an error.

## Conditions

`?` and `while` accept only `yes` or `no`. There is no truthiness: `0`, `""`, `nothing` and `[]` in a condition are errors.

## Scopes and binding

A scope is created by the program itself, by each call of a `proc`, and by each call of a lambda. Conditional branches and loop bodies do **not** create scopes.

- Parameters create fresh bindings in the call's scope and may shadow outer names.
- `=> name` rebinds `name` if it already exists in the current scope, creates it if it exists nowhere in the current procedure call, and is an **error** if it exists only in an enclosing scope of the *same* procedure call (a lambda shadowing its procedure's local, or a top-level lambda shadowing a top-level name). The error exists so that `total + n => total` inside a lambda cannot silently create a shadow and leave the outer `total` unchanged. A `proc` body is a new call, so it may use any local names regardless of what exists outside it; outer names stay readable and are updated only with `=>>`.
- `=>> name` updates the nearest existing binding, searching from the current scope outward through lambdas and procs up to the program scope. It is an error if no binding exists.
- Builtins live in a fallback namespace below the program scope: a user binding may take a builtin's name without error and hides it within that scope.

A lambda captures the scope it was written in and keeps it alive; a procedure that returns a lambda produces a closure.

## Procedures, `out` and `stop`

A call binds parameters, runs the body and yields the value of the last statement, or `nothing` for a body whose last statement is a definition or loop.

`value -> out` ends the nearest enclosing **`proc`** call with `value`, even when written inside a lambda passed to `each` or another builtin. The target is fixed when the lambda is created: if that procedure has already returned, reaching `out` is an error. `out` at the top level is an error.

`stop` ends the innermost `while`, `each` or `repeat`. Builtins other than those let a `stop` pass through to the loop around them. A `stop` whose loop is in a calling procedure is an error: it cannot leave the procedure it is written in.

Calls may nest 10000 deep. Beyond that the program fails with an error naming the limit. Builtins that build large values refuse to build more than 50000000 elements or characters at once, and a program that exhausts memory ends with an error rather than a crash; see `cli.md` for the exact messages.

## Mutation

Arrays, hashmaps and sets are mutable, and builtins that mutate (`put`, `push`, `pop`, `insert`, `remove-at`, `add`, `remove`) change the value in place and return it so flows can continue. Everything else returns a new value. Strings, dates and all primitives are immutable.

A hashmap or set key that is mutated after insertion leaves the container in an undefined state. Use immutable keys or copies.

## Evaluation order

Within a flow, the head is evaluated first, then each step left to right. Within a step, the callee is evaluated, then the arguments left to right, then the call happens. Binary operators evaluate their left operand first; `and` and `or` do not evaluate their right operand when the left one decides the result.

## Printing

`print-ln` writes the human form: strings and chars bare, ints as digits, floats always with a decimal point (`2.0`), `yes`/`no`/`nothing` as written, dates as `yyyy-mm-dd`, arrays as `[1 2 3]`, hashmaps as `{"a": 1  "b": 2}`, sets as `set[1 2 3]`, procedures as `<proc name>` or `<lambda>`. Inside containers, strings are quoted and escaped and chars are shown in backticks. `show` returns that quoted form for any value. String interpolation uses the `print-ln` form.

## Errors

Any error ends the program. The CLI prints `error: <message>` and `  at <file>:<line>:<col>` to standard error and exits with code 1. There is no way to catch an error in this version of the language. `message -> fail` raises an error with a custom message.
