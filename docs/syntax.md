# Syntax

slopersons source is UTF-8 text in `.slop` files. A program is a sequence of statements, one per logical line. There are no semicolons, no braces and no significant indentation.

## Comments

`~` starts a comment that runs to the end of the line.

```
~ a whole-line comment
5 => x   ~ a trailing comment
```

## Flows

Every statement is a flow that reads left to right. The value on the left flows through steps on the right, joined by `->`.

```
[3 8 15] -> keep n | n > 5 -> print-ln
```

The piped value becomes the **first argument** of the procedure it flows into; further arguments follow the procedure's name.

```
x -> add 3          ~ calls add with (x, 3)
x -> between 1 10   ~ calls between with (x, 1, 10)
```

A flow can be split over several lines. A line that starts with `->`, `=>` or `=>>` continues the statement above it at the same margin depth.

```
numbers
-> keep n | n > 10
-> map n | n * 2
-> print-ln
```

A single value on its own line is a flow with no steps and is allowed, but useless unless it is the last line of a procedure, where it is the result.

## Binding

`=>` binds the value flowing through it to a name and passes the value on, so a binding can sit in the middle of a flow.

```
5 => x
x -> double => y -> print-ln     ~ prints 10, y is 10
```

`=>` always binds in the current scope. If the name exists only in an enclosing scope, that is an error, because the intent is ambiguous. `=>>` updates the nearest existing binding, searching from the current scope outward.

```
0 => total
[1 2 3] -> each n
| total + n =>> total        ~ updates the outer total
total -> print-ln               ~ 6
```

Scopes are created only by the program as a whole, by `proc` bodies and by lambda bodies. Conditional and loop blocks share the scope they appear in. See `semantics.md` for the full rules.

## Calls and procedures

A bare name is always a value, never a call. `print-ln` on its own is the print procedure itself. Calling happens only through `->`.

```
proc double n | n * 2
double => d                  ~ d is the procedure
[1 2] -> map double          ~ passes the procedure as a value
```

A procedure with no input is called through `do`, which calls its input with any remaining arguments.

```
today -> do -> print-ln
proc add a b | a + b
add -> do 1 2 -> print-ln       ~ 3
```

`proc name params` defines a named procedure. Its body is an inline body after `|` or a margin block. The value of a procedure is the value of its last statement; `-> out` leaves early with a value.

```
proc describe n
| n > 20 ? "big" -> out
| n > 10 ? "medium" -> out
| "small"

proc double n | n * 2
```

Arity is exact: calling with the wrong number of arguments is an error.

## Lambdas

A lambda is `params | body`. Parameters come before the bar; the body is the rest of the line or a margin block.

```
n | n * 2                    ~ a lambda value
(n | n * 2) => double        ~ bound to a name
a b | a < b                  ~ two parameters
```

A lambda written directly after a call is passed as the call's **last argument**. Any bare names between the last real argument and the bar are its parameters.

```
numbers -> each n | n -> print-ln
numbers -> reduce 0 acc n | acc + n
numbers -> sort-by a b | a < b
```

The same lambda can be written as a margin block: the parameters stay on the header line and the body lines start with `|`.

```
numbers -> each n
| n * 2 => doubled
| doubled -> print-ln
```

A lambda with no parameters needs parentheses when used as a value, because a line cannot start with a bar:

```
(| "hello" -> print-ln) => greet
greet -> do
```

Procedures return lambdas like any other value:

```
proc adder k
| n | n + k

5 -> adder => add-five
10 -> add-five -> print-ln      ~ 15
```

## Blocks

A block is a run of lines that start with `|`, belonging to the header line above them. Nesting adds another bar.

```
proc report xs
| xs -> each x
| | x > 0 ?
| | | x -> print-ln
| "done" -> print-ln
```

Blank lines inside a block are ignored. Blocks attach to the last step of the header line (as a lambda body), to a `proc`, to a `while`, to a conditional branch, or to a line of bare names (making a lambda).

## Conditionals

The condition comes first, then `?`, then the branch. A `:` introduces the else branch; `: condition ?` chains another test.

```
n > 100 ? "big" -> print-ln
: n > 10 ? "medium" -> print-ln
: "small" -> print-ln
```

In block form, each `:` line sits at the same depth as the `?` line:

```
n > 100 ?
| "big" -> print-ln
: n > 10 ?
| "medium" -> print-ln
:
| "small" -> print-ln
```

A conditional has the value of the branch that ran, or `nothing`. In parentheses it is an expression:

```
(n > 1 ? "many" : "one") => label
"{n > 1 ? "many" : "one"} items" -> print-ln
```

Conditions must be `yes` or `no`; any other value is an error.

When conditionals nest inline, `:` belongs to the nearest `?`.

## Loops

`while condition` repeats its body while the condition is `yes`.

```
0 => i
while i < 3
| i -> print-ln
| i + 1 =>> i
```

`each`, `repeat` and friends are procedures that take a lambda; see the stdlib pages. `stop` is a keyword that leaves the innermost `while`, `each` or `repeat`. It cannot leave a procedure.

```
[1 2 3 4] -> each n
| n = 3 ? stop
| n -> print-ln
```

## Literals

| Kind | Examples | Notes |
| --- | --- | --- |
| int | `42`, `1_000_000`, `-7` | arbitrary precision |
| float | `3.14`, `0.5`, `-2.0` | digits on both sides of the point |
| string | `"hello"`, `"a\"b"`, `"tab\t"` | escapes `\" \\ \n \t \r \{ \}` |
| interpolated string | `"total: {total}"`, `"{x -> double}!"` | any flow inside `{}` |
| char | `` `a` ``, `` `👍` ``, `` `\n` `` | one code point between backticks |
| boolean | `yes`, `no` | |
| nothing | `nothing` | the absent value |
| array | `[1 2 3]`, `[]`, `[1 -2 (a - b)]` | elements separated by spaces |
| hashmap | `{"a": 1  "b": 2}`, `{}` | `key: value` pairs separated by spaces |

Brackets may span lines; inside them line breaks are plain whitespace and leading bars are not margins.

```
{"name": "Ada"
 "born": 1815} => person
```

A lambda inside a literal must be parenthesized unless it is the last thing in the literal:

```
{"double": (n | n * 2)  "square": (n | n * n)} => ops
7 -> (ops -> at "square") -> print-ln
```

## Names

Names start with a letter and continue with letters, digits and single hyphens: `total`, `is-empty`, `add-five`, `x2`. Kebab-case is the convention.

Because `a-b` is a name, binary operators need spaces on both sides: `a - b`. Writing `a -b` is a parse error, reported as a missing operator, not a silent subtraction.

Reserved words: `proc`, `while`, `stop`, `yes`, `no`, `nothing`, `and`, `or`, `not`, `mod`.

## Operators

From tightest to loosest:

| Level | Operators |
| --- | --- |
| unary | `-x`, `not x` |
| multiplicative | `*`, `/`, `mod` |
| additive | `+`, `-` |
| comparison | `=`, `/=`, `<`, `>`, `<=`, `>=` (not chainable) |
| `and` | |
| `or` | |

Parentheses group. `a < b < c` is a parse error; write `a < b and b < c`.

Operators apply only to plain expressions. A step's arguments are expressions, so `x -> add 1 + 2` passes `3`. To use a flow's result inside an expression, parenthesize the flow: `((n - 1) -> count) + 1`.

## Parsing rules worth knowing

Each of these produces an error rather than a silent misparse.

- **Trailing names before a bar are parameters.** `xs -> fold start acc n | ...` makes `start` a parameter. Write `fold (start) acc n` to pass a variable.
- **An inline lambda body runs to the end of the line.** `a ? xs -> each n | n -> print-ln : "else" -> print-ln` is an error; the `:` is inside the lambda. Use a margin block or parentheses.
- **A then-branch ends at the first `:`** that is not inside brackets.
- **A line of bare names followed by a block is a lambda.** `n` on one line and `| n + k` below it is `n | n + k`.
- **A literal cannot take a block.**

## Grammar

```
program     := statement*
statement   := 'proc' NAME NAME* body
             | 'while' flow body
             | 'stop'
             | flow '?' then-body (':' flow '?' then-body)* (':' body)?
             | flow
body        := '|' statement | margin-block
flow        := lambda | expr step*
step        := '->' callee expr* (NAME* body)?
             | '=>' NAME
             | '=>>' NAME
callee      := NAME | '(' statement ')'
lambda      := NAME+ body
expr        := or-expr
or-expr     := and-expr ('or' and-expr)*
and-expr    := not-expr ('and' not-expr)*
not-expr    := 'not' not-expr | cmp-expr
cmp-expr    := add-expr (CMP add-expr)?
add-expr    := mul-expr (('+' | '-') mul-expr)*
mul-expr    := unary (('*' | '/' | 'mod') unary)*
unary       := '-' unary | primary
primary     := INT | FLOAT | STRING | CHAR | 'yes' | 'no' | 'nothing' | NAME
             | '[' expr* ']' | '{' (expr ':' expr)* '}' | '(' statement ')'
```
