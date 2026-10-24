# Add a test module with `describe`, `it` and `assert`

## Status

Accepted

## Context

Slopersons programs had no way to test themselves short of printing values and reading them. A basic test module needs little: `describe` and `it` to name and group tests, and `assert` to compare a value with the one expected, available without `use` like the rest of the standard library. Procedures written by users have exact arity, so one function cannot serve both a one-argument and a two-argument assertion.

## Decision

- The module is written in slopersons in `src/stdlib/test.slop` and registered like `json`.
- `name -> test/describe body` prints the name and runs `body` with the tests inside it indented. `name -> test/it body` runs `body` as one test, straight away. Both take a procedure with no inputs as the body, so the usual trailing block is the body, and both return `nothing`.
- A test fails on any runtime error in its body: a failed assertion or anything else, such as a division by zero. The failure prints the error's message and its position in the test file, and the next test still runs.
- `actual -> test/assert expected` compares with `=` and fails with `expected 8, got 7`, both in `show` form. It returns `actual`. A condition is checked against `yes`.
- When the program ends, an `at-end` procedure ([Let source modules run code when the program ends](./202610240955-let-source-modules-run-code-when-the-program-ends.md)) prints `N passed, M failed` if any test ran, and makes a program that would have exited with 0 exit with 1 if a test failed.
- Results go to standard output, marked `✓` and `✗`.

Rejected:

- `condition -> test/assert` taking only a condition: a failure could only say that it failed. Comparing an actual value with an expected one lets the message show both, and a condition costs only a `-> test/assert yes`.
- A separate test runner that finds and runs test files: a test file is an ordinary program, and `use` combines several into one run.
- Collecting tests first and running them afterwards, as Mocha does: tests would no longer run in the order of the file, and nothing in the language needs selecting or skipping tests yet.
- Stopping at the first failure: one broken test would hide the state of all the others.

## Consequences

- Any program can contain tests, and `slopersons file.slop` runs them, with an exit code that scripts and CI can rely on.
- There is no way to select, skip or time tests, no setup and teardown hooks, and no assertions besides equality.
- Equality is strict about types, so a test that expects `1.0` fails on `1`.
