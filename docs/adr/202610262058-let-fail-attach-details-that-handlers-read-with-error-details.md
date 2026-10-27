# Let fail attach details that handlers read with error/details

## Status

Proposed

## Context

[Handle errors with attempt and recover](./202610231610-handle-errors-with-attempt-and-recover.md) gave errors a message and a position, and nothing else. A program split into layers needs more than that. A web app's domain code fails because something does not exist, because the input is invalid, or because the person may not do it, and its HTTP layer answers 404, 422 or 403 depending on which. With only a message, the HTTP layer has to recognise failures by their wording, so rewording a message changes a status code.

The other way, returning a result value such as `{"ok": no  "problem": "not-found"}` from every procedure that can fail, makes every caller check and pass it on by hand, through several layers. Slopersons has no pattern matching or `?` operator to shorten that.

Many languages solve this with error classes or types. Slopersons has no user-defined types: its records are hashmaps.

## Decision

- **`fail` takes an optional second input, the details:** `"issue 9 does not exist" -> fail {"kind": "not-found"  "id": 9}`. They can be any value. The message stays a required string, so errors still print the same way.
- **`error -> error/details` returns them,** or `nothing` for an error raised without details, which includes every error the interpreter raises itself.
- **Raising an error value again with `e -> fail` keeps its details,** as it keeps its message and position. Giving details along with an error value is an error, because that form raises the error unchanged.
- **Errors a [source module](./202610240926-write-host-independent-standard-library-modules-in-slopersons.md) raises keep their details** when they are moved to the caller's arrow.
- **Two errors are equal when their messages, positions and details are equal.**
- Details are a plain value, not a kind or code the interpreter knows about. What a program puts there is its own convention.

Rejected:

- **An error kind as a string (`"..." -> fail "not-found"`).** One string covers the HTTP case, but not data a handler needs, such as which field was invalid. A hashmap holds a kind and data both.
- **A separate constructor, `message -> error/make details`, then `-> fail`.** It is two steps for the common case, and it creates error values without a position at the point they are raised.
- **Result values only.** Explained above: every layer would have to check them by hand.
- **Error types declared by the program.** Slopersons has no user-defined types, and adding them for errors alone is far larger than this.

## Consequences

- Code can tell failures apart without matching message text, and a message can be reworded without breaking callers.
- The interpreter's own errors have no details, so a handler that relies on details must still handle `nothing`, usually by raising the error again.
- Details that are a hashmap or an array are shared, not copied: changing them after `fail` changes what handlers see.
- `fail`'s arity is now one or two, and error values carry one more field.
