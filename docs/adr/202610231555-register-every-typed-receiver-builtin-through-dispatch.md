# Register every typed-receiver builtin through dispatch

## Status

Accepted

## Context

The first standard library modules used plain registration for names they believed unique to their type and dispatch only for known-shared names. Written concurrently, the modules disagreed about which names were shared (`put`, `keep`, `copy`, `count`), and a plain registration silently replaced a dispatching one depending on registration order.

## Decision

Every builtin whose first argument has a type is registered through dispatch, even when only one type has it today. Plain builtins are only those that accept any value (`print`, `print-ln`, `show`, `type-of`, `do`, `out`, `fail`, `exit`) or take no input (`today`, `read-line`). Registering a name twice, or both plainly and by type, throws at startup.

## Consequences

- Collisions between modules are caught by the first test run instead of silently dropping one implementation.
- The wrong receiver is reported as `` `push` cannot be used with an int; it works on array ``, while other arguments keep the form `` the index of `at` must be an int, got a string ``.
