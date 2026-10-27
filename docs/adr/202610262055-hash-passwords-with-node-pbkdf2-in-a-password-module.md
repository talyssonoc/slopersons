# Hash passwords with Node's PBKDF2 in a password module

## Status

Accepted

## Context

Web apps built on the [http module](./202610241758-serve-http-from-a-slopersons-module-over-sockets.md) that let people log in must store passwords so that a leaked data file does not reveal them. That needs a slow, salted password hash. The [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html) prefers Argon2id, scrypt and bcrypt, and accepts PBKDF2 with HMAC-SHA-256 at "600,000 iterations" or more, with a unique random salt for each password.

The interpreter implements algorithms itself rather than wrapping JavaScript ([Implement data structures and algorithms instead of wrapping JavaScript](./202610231543-implement-data-structures-and-algorithms-instead-of-wrapping-javascript.md)), and modules that need nothing from the host are written in slopersons ([Write host-independent standard library modules in slopersons](./202610240926-write-host-independent-standard-library-modules-in-slopersons.md)). Neither works for a password hash:

- Its strength comes from how much computing it takes. One loop of 64 rounds of five int operations, about the shape of one SHA-256 block, takes about 0.09 ms in slopersons, and slopersons has no bit operations, so a real block would cost several times that. PBKDF2 at 600,000 iterations needs 1,200,000 blocks, which would take minutes per login. Lowering the iterations to make it fast makes it weak.
- Cryptographic code written by hand risks mistakes that tests with a few vectors do not find.

Node's `crypto.pbkdf2Sync` derives the same key in about 46 ms on the machine this was measured on (Node 26.12.1, Apple silicon, 2026-10-26), and `crypto.timingSafeEqual` compares two buffers in time that does not depend on where they differ.

## Decision

- **A `password` module, written in TypeScript (`src/stdlib/password.ts`), with two members:**
  - `text -> password/hash` returns `pbkdf2-sha256$600000$<salt>$<key>`: the scheme, the iterations, a 16-byte salt drawn from the interpreter's `Randomness` and a 32-byte key, both in lowercase hex.
  - `text -> password/verify stored` derives a key with the iterations, salt and key length written in `stored` and compares it with `stored`'s key in constant time. It returns `yes` or `no`, and fails when `stored` is not in that form or asks for more than 10,000,000 iterations.
- **The derivation and comparison are Node's**, called from `src/crypto.ts`, a boundary file like `src/file-system.ts`. It is the only file outside the I/O boundary allowed to import `node:`, and only for these two functions. The password is encoded as UTF-8 by `src/runtime/utf8.ts`, and the format is parsed by our own code.
- **The stored text carries its own parameters,** so raising the iteration count later does not break the hashes already stored: old ones still verify with the count they were made with.

Rejected:

- **SHA-256 and PBKDF2 written in slopersons.** Too slow by orders of magnitude, as measured above.
- **SHA-256 and PBKDF2 written in our TypeScript.** It would keep the no-proxy rule whole, but hand-written cryptography is where subtle mistakes cost the most, and the rule exists to make the language's own data structures and algorithms ours, not to reimplement security primitives.
- **Argon2id or scrypt.** Node 26 has `crypto.scryptSync`, and OWASP ranks scrypt above PBKDF2. PBKDF2 was chosen because its single cost parameter is simple to state and check, and OWASP accepts it. A program can move to scrypt later with a new scheme name in the stored text.
- **Exposing `sha256` or `hmac`.** Nothing needs them yet. Hashing passwords with a plain fast hash is the most common mistake they would make possible.
- **Making the iterations an argument of `password/hash`.** A caller could pick a weak count. Tests of apps that hash many passwords pass a fake hashing procedure in instead.

## Consequences

- Hashing or verifying a password takes about 50 ms of the program's thread. With [one request at a time](./202610241758-serve-http-from-a-slopersons-module-over-sockets.md), a login holds up the other clients for that long.
- `test/no-proxy.test.ts` allows `node:` imports in `src/crypto.ts`. Any other use of Node's crypto still needs its own decision.
- The standalone executable carries Node, so `password` works the same there.
- Moving to another algorithm is a new scheme name that `password/verify` also recognises, not a change to this format.
