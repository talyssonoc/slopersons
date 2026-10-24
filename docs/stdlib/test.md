# Test builtins

The `test` module is a small way to write tests in slopersons: `test/describe` groups tests, `test/it` runs one, and `test/assert` checks a value. Like every builtin module it needs no `use`. It is written in slopersons itself (`src/stdlib/test.slop`).

A test file is an ordinary program:

```
proc double n | n * 2

"double" -> test/describe
| "doubles positive numbers" -> test/it
| | 4 -> double -> test/assert 8
| "keeps zero" -> test/it
| | 0 -> double -> test/assert 1
```

`slopersons double.test.slop` prints the following and exits with 1, because a test failed:

```
double
  ✓ doubles positive numbers
  ✗ keeps zero
    expected 1, got 0
    at double.test.slop:7:17

1 passed, 1 failed
```

Tests run in the order they are written, each one as soon as its `test/it` is reached. There is no separate test runner and no way to pick which tests run. To run the tests of several files together, load them with `use` from one program; the summary covers all of them.

## describe

`name -> test/describe body`

Prints `name`, then runs `body`, a procedure with no inputs, with the tests inside it indented one more level. Groups can nest. An error raised in `body` outside any `test/it` stops the program, as it would anywhere else. Returns `nothing`.

Errors: `name` is not a string (`` the name of `test/describe` must be a string, got an int ``); `body` is not a procedure.

## it

`name -> test/it body`

Runs `body`, a procedure with no inputs, as one test. The test passes when the body finishes and fails when it raises a runtime error: a failed `test/assert`, or anything else, such as a division by zero. A failure prints the error's message and position and does not stop the program; the next test runs. Returns `nothing`.

Errors: `name` is not a string; `body` is not a procedure (`` the body of `test/it` must be a procedure, got an int ``).

## assert

`actual -> test/assert expected`

Fails when `actual = expected` is `no`, with a message that shows both in the form `show` gives: `expected 8, got 7`. The comparison is `=`, so it is structural and never converts between types: `1 -> test/assert 1.0` fails. Returns `actual`. Outside a test, a failed assertion is an ordinary runtime error.

A condition is checked by comparing it with `yes`:

```
(xs -> array/length) > 2 -> test/assert yes
```

## The summary and the exit code

When the program ends, after its last line, after `exit` or after an error, it prints a blank line and `N passed, M failed` if any test ran. A program that would have exited with 0 exits with 1 when a test failed; a program that already exits with another code, because of an error or `exit`, keeps that code. In the REPL, the summary comes when the session ends.
