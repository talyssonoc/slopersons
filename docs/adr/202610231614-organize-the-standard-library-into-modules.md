# Organize the standard library into modules

## Status

Accepted

## Context

With user modules in place, the standard library was the odd one out: a flat namespace of bare names where `length`, `at` and `each` dispatched on the receiver's type. The project owner asked for the standard library to use the same module shape (`io/print`, `array/length`, `char/upper`), with the modules available without a `use`, and for a proposal of what, if anything, should stay bare.

## Decision

- **A function lives in the module of its receiver's type.** `array/length`, `string/length`, `hashmap/length` and `set/length` are separate functions. The one exception is constructors, which live in the module of the type they build: `string/from-chars`, `date/make`, `date/parse`, `time/make`, `time/parse`, `datetime/parse`, `datetime/from-epoch`, `array/to-set` (its receiver is the array it converts).
- **Only control flow and inspection stay bare:** `do`, `out`, `fail`, `exit`, `use`, `type-of`, `show`. Output moved to `io/print`, `io/print-ln` and `io/read-line`. The range builder became `int/up-to` and the counted loop `int/times`.
- **Numeric functions that accept either number type form a `math` module** (`abs`, `pow`, `sqrt`, `min`, `max`, `clamp`, `sign`), the only place besides `date/is-leap-year` where a member still dispatches on the receiver's type. `int/` and `float/` keep what is specific to one type.
- **The builtin modules are ordinary module values** bound in the fallback namespace, so `array -> module/names` lists a module, `array/map => map` brings a member into scope, and user modules and builtin modules are reached the same way.
- **Duplicates were dropped:** `hashmap/to-array` (same as `entries`) and `set/contains` (same as `has`).
- **Messages name the member:** `` the input of `array/length` must be an array, got a string ``, `` `array/each` expects 2 arguments, got 1 ``.

Rejected:

- Keeping a small set of polymorphic bare verbs (`length`, `at`, `each`, `to-string`) beside the module versions: two ways to say the same thing, and the module name is itself the documentation of what a call expects.
- Keeping `print-ln` bare as the one everyday exception: considered, since output appears in nearly every program; rejected for the uniform rule, with `io/print-ln => print-ln` as the escape hatch for output-heavy programs.
- Duplicating numeric functions under both `int/` and `float/`: mixed-type calls such as `3 -> int/min 2.5` read oddly and every function would exist twice.

## Consequences

- Every call site names its module, so programs are longer (`xs -> array/keep n | n > 2`) and every example, test and doc page was rewritten.
- Type dispatch, and the registration machinery for it, is nearly gone; a wrong receiver is an ordinary argument type error.
- A program that binds a module's name (`[1 2] => array`) hides that module within the scope, exactly as shadowing a bare builtin did before; `array/length` then reports that `array` is an array, not a module.
- The registry grew `builtinModule`, `defineIn` and `defineMethodIn`; `defineBuiltin` remains for the seven bare builtins.
