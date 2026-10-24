# Bind locally by default and mark outer updates explicitly

## Status

Accepted

## Context

A binding statement has to decide which scope it writes to. Three models were weighed: always local, with an explicit marker for updating an outer binding; Ruby-block semantics, where binding a name updates the nearest existing binding; and a hybrid where lambdas share their enclosing scope and procedures isolate.

Two refinements came from running programs. First, `total + n => total` inside an `each` lambda would silently create a shadow and leave the accumulator unchanged, so shadowing became an error. Second, the guided calculator example broke on its second round: `ask-operator` binds a local `op`, the caller later bound a top-level `op`, and from then on the procedure's own local was rejected. A procedure's locals must not depend on the names its callers choose. Separately, inside a top-level `while` body `i` is local, so a strict "enclosing scopes only" `=>>` rejected `i + 1 =>> i` while the same line inside an `each` lambda required it.

## Decision

Scopes are created by the program, by each `proc` call and by each lambda call; conditional and loop blocks share the scope they appear in. Parameters always create fresh bindings.

- `=> name` rebinds `name` if it exists in the current scope, creates it if it exists nowhere in the current procedure call, and is an error if it exists only in an enclosing scope of the same procedure call. The error message points at `=>>`.
- `=>> name` updates the nearest existing binding, searching from the current scope outward through lambdas and procedures up to the program scope, and is an error if none exists.
- A `proc` body may shadow anything outside the call.

Rejected:

- Ruby-block semantics (update the nearest existing binding everywhere): a procedure can silently clobber a global.
- A hybrid where lambdas share and procedures isolate.
- Checking shadowing through every enclosing scope: couples a procedure's locals to its callers' names.
- An `=>>` that only searches enclosing scopes: made the same accumulator line valid in one loop form and invalid in another.

## Consequences

- Accumulators updated inside lambdas must use `=>>`.
- `=>>` is always safe for "update this counter wherever it lives" and `=>` always means "this one is mine".
- A lambda can never silently shadow a local of the procedure it is written in.
