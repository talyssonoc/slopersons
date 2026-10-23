# Core builtins

The standard library is a set of modules that are always available, without a `use`. Each module is named after the type its members work on, and a member is reached with a qualified name: `"hi" -> io/print-line`, `[3 8 15] -> array/keep n | n > 5`. A member is called like any other procedure: the piped value is the first argument, further arguments follow the name, and a trailing `params | body` lambda or margin block is the last argument.

| Module | What it holds | Page |
| --- | --- | --- |
| `io` | writing to standard output, reading standard input | [io.md](io.md) |
| `int` | int-only functions, the range builder `int/up-to`, the counted loop `int/times` | [int.md](int.md) |
| `float` | float-only functions | [float.md](float.md) |
| `math` | numeric functions that take an int or a float: `abs`, `pow`, `sqrt`, `min`, `max`, `clamp`, `sign` | [math.md](math.md) |
| `char` | single code points | [char.md](char.md) |
| `boolean` | `yes` and `no` | [boolean.md](boolean.md) |
| `string` | text, plus `string/from-chars` to build one from an array of chars | [string.md](string.md) |
| `array` | ordered collections, plus `array/to-set` | [array.md](array.md) |
| `hashmap` | key-value collections | [hashmap.md](hashmap.md) |
| `set` | collections of distinct values | [set.md](set.md) |
| `date` | calendar dates, built with `date/make`, `date/parse` or `date/today` | [date.md](date.md) |
| `time` | times of day, built with `time/make` or `time/parse` | [time.md](time.md) |
| `datetime` | a date with a time, built with `date/at-time`, `datetime/parse`, `datetime/from-epoch` or `datetime/now` | [datetime.md](datetime.md) |
| `error` | the values `recover` binds | [error.md](error.md) |
| `module` | module values, loaded with `use` or builtin | [module.md](module.md) |

A function lives in the module of its input's type, so `array/length`, `string/length`, `hashmap/length` and `set/length` are four separate functions, and a loop over an array is `array/each` while a loop over a string is `string/each`. Constructors live in the module of the type they build: `string/from-chars` takes an array of chars and `array/to-set` takes an array. Only `math/*` and `date/is-leap-year` (a date or an int year) accept more than one input type.

The builtin modules are ordinary module values, bound in the fallback namespace below the program's scope, so everything on the [module page](module.md) works on them and a member can be bound to a shorter name:

```
io -> module/names -> io/print-line     ~ ["print-line" "print" "read-line"]
io -> io/print-line                     ~ <module io>
proc double n | n * 2
array/map => map
[1 2] -> map double -> io/print-line    ~ [2 4]
```

Binding a module's name hides the module within that scope, as with any builtin: after `[1 2] => array`, `array/length` fails because `array` is now an array, not a module.

Seven builtins stay bare because they are control flow or work on any value: `do`, `out`, `fail`, `exit`, `use`, `type-of` and `show`. This page documents them, and ends with a note on the keyword `stop`.

Conventions used in every stdlib page:

- The signature line shows the call in flow form with placeholder names.
- "Errors" lists the conditions that stop the program with `error: ...` unless an enclosing `attempt` handles them. Type errors name the member: `` the input of `string/length` must be a string, got an int ``. Arity errors read `` `array/each` expects 2 arguments, got 1 ``.
- Examples show the program followed by its output in a comment.

## show

`value -> show`

Returns the literal form of `value` as a string: strings come back quoted and escaped, chars in backticks, everything else as `io/print-line` would show it inside a container.

```
"a\"b" -> show -> io/print-line   ~ "a\"b"
`x` -> show -> io/print-line      ~ `x`
io -> show -> io/print-line       ~ <module io>
```

## type-of

`value -> type-of`

Returns the type name as a string: `int`, `float`, `char`, `boolean`, `string`, `nothing`, `array`, `hashmap`, `set`, `date`, `time`, `datetime`, `error`, `module` or `proc`. Builtin procedures report `proc` like user-defined ones.

```
[1 2] -> type-of -> io/print-line         ~ array
io -> type-of -> io/print-line            ~ module
io/print-line -> type-of -> io/print-line ~ proc
```

## do

`procedure -> do arg...`

Calls `procedure` with the given arguments. This is how a procedure with no input is called, since a bare name is a value, not a call.

```
date/today -> do -> io/print-line  ~ the current date
proc add a b | a + b
add -> do 1 2 -> io/print-line     ~ 3
```

Errors: the input is not a procedure; wrong number of arguments for the procedure.

## out

`value -> out`

Exits the nearest enclosing `proc` with `value` as its result, even from inside a lambda passed to `array/each` or another builtin.

```
proc find-first xs target
| xs -> array/each x
| | x = target ? x -> out
| nothing

[4 7 9] -> find-first 7 -> io/print-line   ~ 7
```

Errors: used at the top level; used inside a lambda whose procedure has already returned.

## fail

`message -> fail` or `error -> fail`

With a string, raises an error with that message at the position of the call. With an error value, raises that error again unchanged, keeping its original message and position. Either way the error can be handled by an enclosing `attempt`, and ends the program otherwise.

```
attempt | "boom" -> fail recover e | e -> io/print-line   ~ boom
```

Errors: the input is neither a string nor an error.

## use

`path -> use`

Loads another `.slop` file as a module and returns the module value. The path is relative to the current file (the working directory in the REPL) and `.slop` is added when missing. A file is loaded once per run. See the Modules section of `semantics.md` and the [module page](module.md).

```
"./lib/geometry" -> use => geometry
2.0 -> geometry/circle-area -> io/print-line   ~ 12.56636
```

Errors: the path is not a string; the file cannot be read; the file imports itself through a cycle; an `export` in the file names something it never binds.

## exit

`code -> exit`

Ends the program with the given exit code, after all output so far has been written.

Errors: the code is not an int between 0 and 255.

## stop

`stop` is a keyword, not a builtin. It exits the innermost `while` or loop builtin: `array/each`, `string/each`, `hashmap/each`, `set/each` or `int/times`. It cannot leave a procedure: a `stop` whose loop is in a caller is an error.
