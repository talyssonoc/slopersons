# Draw random values from a secure generator, with no seed

## Status

Proposed

## Context

Slopersons had no source of chance. Games and simulations need it. Web apps built on the [http module](./202610241758-serve-http-from-a-slopersons-module-over-sockets.md) need it for session ids and other tokens, which must be impossible to guess: anyone who can predict a session id can take over the session.

The interpreter does not wrap JavaScript ([Implement data structures and algorithms instead of wrapping JavaScript](./202610231543-implement-data-structures-and-algorithms-instead-of-wrapping-javascript.md)), and the standard library reaches the operating system only through interfaces the host supplies, as it does for files, standard input and sockets. JavaScript's `Math.random` is not cryptographically secure ([MDN](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/random)). Node's `crypto.randomFillSync` fills a buffer with "cryptographically strong pseudorandom data" ([Node crypto](https://nodejs.org/api/crypto.html#cryptorandomfillsyncbuffer-offset-size)).

Unit tests run the interpreter in-process and need results they can predict.

## Decision

- **One source, and a secure one.** The interpreter takes a `Randomness` (`src/runtime/random.ts`), whose only operation fills a byte buffer. The worker passes one backed by `crypto.randomFillSync` (`systemRandomness` in `src/cli.ts`), for programs and the REPL alike. There is no seed and no second, faster generator.
- **The arithmetic is ours,** in `src/runtime/random.ts`:
  - an int below a bound takes just enough bytes for the bound, masks the extra bits of the first byte, and draws again when the value is past the range. Taking the remainder instead would make low values more likely whenever the range does not divide 256ⁿ;
  - a float is 53 random bits divided by 2⁵³, which is every multiple of 2⁻⁵³ in [0, 1) with equal chance;
  - a shuffle is Fisher–Yates over a copy.
- **Builtins live in the module of the type they build or work on,** as [Organize the standard library into modules](./202610231614-organize-the-standard-library-into-modules.md) requires:
  - `low -> int/random high`, with both ends included, since a die is `1 -> int/random 6`;
  - `float/random -> do`;
  - `xs -> array/pick` and `xs -> array/shuffle`, which returns a new array, like `array/sort`;
  - `length -> string/random-hex`, for tokens. 32 digits are 128 bits, double the 64 bits of entropy the [OWASP Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html) asks of a session id.
- **Without a source, drawing is an interpreter bug.** An `Interpreter` created without `randomness` gets `NO_RANDOMNESS`, which throws a JavaScript error, an internal error rather than a slopersons one. Tests pass scripted bytes and check exact results.

Rejected:

- **`Math.random`.** It is not secure, so `string/random-hex` could not be used for session ids, and the language would hand out a primitive that is unsafe for its most common web use.
- **A seeded generator of our own, beside or instead of the secure one.** Seeds make runs repeatable, but with two generators the fast, predictable one ends up making tokens. Code that depends on chance can take the chosen value as an input instead, as the notes app takes the current time. A seeded generator can be added later as its own value type if simulations need to replay runs.
- **A `random` module** (`random/int`, `random/shuffle`). It would gather the functions in one place, but it breaks the rule that a constructor lives in the module of the type it builds, which every other module follows.
- **`int/random` excluding its upper end,** as many languages' range functions do. `1 -> int/random 6` reading as a die roll matters more here, and `int/up-to` already includes both ends.
- **Random bytes, base64 tokens or UUIDs.** There is no bytes type. Hex is the plainest text form of random bits, and it is safe in URLs, cookies and file names without escaping.

## Consequences

- A program cannot replay a run that involved chance. Tests of such programs pass values in rather than seed the generator.
- Every draw asks for fresh bytes: one small call into Node's generator per value, with no batching. That is fast enough for tokens and games, and could matter for simulations drawing millions of values.
- Adding a host interface adds one more thing a custom embedding of the interpreter must supply, as with `Network`.
- A seeded generator, if ever needed, is a separate decision.
