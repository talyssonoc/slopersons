# slopersons

slopersons is a small dynamically typed, structured programming language in which every statement is a left-to-right flow of data through procedures. It has first-class procedures, arbitrary-precision integers, and a standard library of strings, arrays, hashmaps, sets, dates, times and datetimes implemented inside the interpreter.

```
~ even-sum.slop
[3 8 15 22 7] => numbers
0 => total

numbers -> array/each n
| n mod 2 = 0 ? total + n =>> total

"even total: {total}" -> io/print-ln

proc describe n
| n > 20 ? "big" -> out
| n > 10 ? "medium" -> out
| "small"

numbers -> array/map describe -> io/print-ln
```

Running it:

```
$ slopersons even-sum.slop
even total: 30
["small" "small" "medium" "big" "small"]
```

## Where to read next

- [syntax.md](syntax.md): every construct, with the parsing rules that make them unambiguous
- [semantics.md](semantics.md): values, arithmetic, equality, scoping, procedures, errors
- [cli.md](cli.md): running programs, exit codes, error output
- [adr/README.md](adr/README.md): the Architecture Decision Records, one file per decision with its context, rejected alternatives and consequences
- [stdlib/core.md](stdlib/core.md): the bare builtins and how the standard library is split into modules; then one page per module: [io](stdlib/io.md), [int](stdlib/int.md), [float](stdlib/float.md), [math](stdlib/math.md), [char](stdlib/char.md), [boolean](stdlib/boolean.md), [string](stdlib/string.md), [array](stdlib/array.md), [hashmap](stdlib/hashmap.md), [set](stdlib/set.md), [date](stdlib/date.md), [time](stdlib/time.md), [datetime](stdlib/datetime.md), [error](stdlib/error.md), [module](stdlib/module.md)
- [examples/](examples/): complete programs; each has a `.out` file with its exact output and runs as part of the test suite

## The shape in one minute

- `value -> procedure arg` calls the procedure with the value as its first argument. There are no parentheses for calls and no dot syntax.
- The standard library is a set of modules that are always available, named after the type they work on: `"hi" -> io/print-ln`, `xs -> array/map n | n * 2`, `"2026-10-23" -> date/parse`. `array/map => map` brings a member into scope.
- `value => name` binds. `=>>` updates a binding from an enclosing scope.
- `condition ? then : else`, with `:` chaining more tests.
- Blocks are lines starting with `|`; nesting adds bars.
- `params | body` is a lambda; written after a call it becomes the call's last argument.
- `proc name params` defines a procedure; `-> out` returns early; `stop` leaves a loop.
- `attempt` runs a body and `recover e` handles any runtime error it raised, with `e` an error value.
- `"./lib/geometry" -> use => geometry` loads another file as a module; `geometry/area` reaches an exported name; a module lists what it exposes with `export`.
- Names are kebab-case, so operators need spaces around them.
