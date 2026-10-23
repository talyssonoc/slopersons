# Core builtins

Builtins that are not tied to one type. Every builtin is called by flowing a value into it: the piped value is the first argument, further arguments follow the name, and a trailing `params | body` lambda or margin block is the last argument.

Conventions used in every stdlib page:

- The signature line shows the call in flow form with placeholder names.
- "Errors" lists the conditions that stop the program with `error: ...`. Type errors read `the input of \`name\` must be a string, got an int`.
- Examples show the program followed by its output in a comment.

## print-ln

`value -> print-ln`

Writes the human form of `value` and a newline to standard output, then returns `value` so it can sit in the middle of a flow. Strings and chars print bare; inside arrays and hashmaps they print quoted. Floats always show a decimal point.

```
"hi" -> print-ln              ~ hi
[1 "a" `b` 2.0] -> print-ln   ~ [1 "a" `b` 2.0]
3 -> print-ln -> double       ~ prints 3, flows 6 onward
```

## print

`value -> print`

Like `print-ln` but without the trailing newline, so a prompt can stay on the same line as the answer. Returns `value`.

```
"Name: " -> print
read-line -> do => name
```

## show

`value -> show`

Returns the literal form of `value` as a string: strings come back quoted and escaped, chars in backticks, everything else as `print-ln` would show it inside a container.

```
"a\"b" -> show -> print-ln    ~ "a\"b"
`x` -> show -> print-ln       ~ `x`
```

## type-of

`value -> type-of`

Returns the type name as a string: `int`, `float`, `char`, `boolean`, `string`, `nothing`, `array`, `hashmap`, `set`, `date` or `proc`.

## do

`procedure -> do arg...`

Calls `procedure` with the given arguments. This is how a procedure with no input is called, since a bare name is a value, not a call.

```
today -> do -> print-ln
proc add a b | a + b
add -> do 1 2 -> print-ln     ~ 3
```

Errors: the input is not a procedure; wrong number of arguments for the procedure.

## out

`value -> out`

Exits the nearest enclosing `proc` with `value` as its result, even from inside a lambda passed to `each` or another builtin.

```
proc find-first xs target
| xs -> each x
| | x = target ? x -> out
| nothing
```

Errors: used at the top level; used inside a lambda whose procedure has already returned.

## stop

`stop` is a keyword, not a builtin. It exits the innermost `while`, `each` or `repeat`. It cannot leave a procedure: a `stop` whose loop is in a caller is an error.

## to

`from -> to until`

Builds an array of ints from `from` to `until` inclusive. An empty array when `until` is less than `from`.

```
1 -> to 4 -> print-ln         ~ [1 2 3 4]
```

Errors: either bound is not an int.

## repeat

`count -> repeat | body` or `count -> repeat i | body`

Runs the body `count` times. With one parameter the lambda receives the iteration index starting at 0. `stop` ends the loop early. Returns `nothing`.

Errors: the count is not an int; the body is not a procedure.

## each

`array -> each item | body`

Calls the body once per element, in order, and returns `nothing`. `stop` ends the loop early and `out` leaves the enclosing procedure. Other types have their own `each`: see the string, hashmap and set pages.

Errors: the input type has no `each`; the body is not a procedure.

## read-line

`read-line -> do`

Reads one line from standard input without its line break. Returns `nothing` at end of input.

## fail

`message -> fail` or `error -> fail`

With a string, raises an error with that message at the position of the call. With an error value, raises that error again unchanged, keeping its original message and position. Either way the error can be handled by an enclosing `attempt`, and ends the program otherwise.

```
attempt | "boom" -> fail recover e | e -> print-ln   ~ boom
```

Errors: the input is neither a string nor an error.

## use

`path -> use`

Loads another `.slop` file as a module and returns the module value. The path is relative to the current file (the working directory in the REPL) and `.slop` is added when missing. A file is loaded once per run. See the Modules section of `semantics.md`.

```
"./lib/geometry" -> use => geometry
2.0 -> geometry/circle-area -> print-ln
```

Errors: the path is not a string; the file cannot be read; the file imports itself through a cycle; an `export` in the file names something it never binds.

## Module values

A module value prints as `<module name>`, where the name is the file name without `.slop`, and is equal only to itself.

- `module -> at "name"`: the exported member, or an error naming the module and the missing name.
- `module -> has "name"`: whether the name is exported.
- `module -> names`: the exported names as an array of strings, in export order.
- `module -> path`: the file the module was loaded from.

```
geometry -> names -> print-ln   ~ ["pi" "circle-area" "square-area" "describe"]
```

## Error values

A handler's error is a value of type `error`. It prints as its message; `show` gives `<error message>`.

- `error -> message`: the message as a string.
- `error -> line`, `error -> column`: where the error was raised, as ints, or `nothing` when unknown.
- `error -> file`: the file the error was raised in, as a string, or `nothing` when unknown.
- `error -> to-string`: the same as `message`.

```
attempt
| 1 / 0
recover e
| "{e -> message} at line {e -> line}" -> print-ln   ~ division by zero at line 2
```

## exit

`code -> exit`

Ends the program with the given exit code, after all output so far has been written.

Errors: the code is not an int between 0 and 255.
