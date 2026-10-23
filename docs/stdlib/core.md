# Core builtins

Builtins that are not tied to one type. Every builtin is called by flowing a value into it: the piped value is the first argument, further arguments follow the name, and a trailing `params | body` lambda or margin block is the last argument.

Conventions used in every stdlib page:

- The signature line shows the call in flow form with placeholder names.
- "Errors" lists the conditions that stop the program with `error: ...`. Type errors read `the input of \`name\` must be a string, got an int`.
- Examples show the program followed by its output in a comment.

## print

`value -> print`

Writes the human form of `value` and a newline to standard output, then returns `value` so it can sit in the middle of a flow. Strings and chars print bare; inside arrays and hashmaps they print quoted. Floats always show a decimal point.

```
"hi" -> print              ~ hi
[1 "a" `b` 2.0] -> print   ~ [1 "a" `b` 2.0]
3 -> print -> double       ~ prints 3, flows 6 onward
```

## show

`value -> show`

Returns the literal form of `value` as a string: strings come back quoted and escaped, chars in backticks, everything else as `print` would show it inside a container.

```
"a\"b" -> show -> print    ~ "a\"b"
`x` -> show -> print       ~ `x`
```

## type-of

`value -> type-of`

Returns the type name as a string: `int`, `float`, `char`, `boolean`, `string`, `nothing`, `array`, `hashmap`, `set`, `date` or `proc`.

## do

`procedure -> do arg...`

Calls `procedure` with the given arguments. This is how a procedure with no input is called, since a bare name is a value, not a call.

```
today -> do -> print
proc add a b | a + b
add -> do 1 2 -> print     ~ 3
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
1 -> to 4 -> print         ~ [1 2 3 4]
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

`message -> fail`

Stops the program with `error: message` and the position of the call.

Errors: the message is not a string.

## exit

`code -> exit`

Ends the program with the given exit code, after all output so far has been written.

Errors: the code is not an int between 0 and 255.
