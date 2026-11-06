# Show builtin documentation in the editor from docs/stdlib

## Status

Proposed

## Context

The language server answers what a name of the program is ([Resolve names statically in statement order for editors](./202611061526-resolve-names-statically-in-statement-order-for-editors.md)), but a builtin such as `string/split` was only a name: what it takes and does is in `docs/stdlib/<module>.md`. The standard library has 257 builtins, too many to remember.

Each page there follows the same shape, which `AGENTS.md` asks for when a builtin is added: a `#` title and an introduction, then for each builtin a `##` heading with its name, a line with its usage in flow form in backticks (`text -> string/split separator`), and a paragraph describing it. Some headings group several builtins; one group (`datetime/year` and eight others) shows only the first usage, followed by "and so on". Bare builtins are on `core.md`.

The standalone executable embeds the `.slop` files of the standard library at build time through an esbuild `define` and reads them from `src/stdlib/` when run from a checkout (`standardSourceModule` in `src/modules.ts`). It carried none of `docs/`.

## Decision

The server reads its builtin documentation from `docs/stdlib/*.md`. `src/builtin-docs.ts` takes, for each name a `##` heading lists, the usage span that names it, or a sibling's span with the name replaced, and the paragraph after it; for each module page, the introduction. `scripts/build-binary.ts` embeds the pages as `SLOPERSONS_STDLIB_DOCS`, and `src/cli.ts` reads them from `docs/stdlib/` in a checkout.

With it, the server:

- shows on hover the usage and description of a builtin, and the introduction of a builtin module; for names of the program, a procedure's `proc` line, or what kind of name it is, also for members of modules loaded with `use`;
- shows signature help while a call's inputs are typed: the builtin's usage, or the `proc` line of a procedure, with the input being typed highlighted. The piped value is the first input and is not counted.

Alternatives considered:

- **Write the documentation into the registry** (a description and parameter names on `defineIn`). It cannot drift from the code, but the descriptions would exist twice, in TypeScript and in `docs/stdlib`, and the pages are what people read.
- **Generate a documentation file from `docs/stdlib` and commit it.** No parsing at run time, but every edit to a page would need a regeneration step, and a test to check it was run.
- **Show only names and arities from the registry.** No dependency on the pages' format, but an arity does not say what the inputs mean.

## Consequences

- The shape of `docs/stdlib` pages is now read by a program. `test/hover.test.ts` checks that every builtin and every member of a builtin module has a section whose usage names it, so an undocumented builtin, or a section in another shape, fails it.
- The summary is the first paragraph after the usage, as written for people. A page that puts something else there shows that.
- Signature help counts inputs by words at bracket depth 0, joining operator expressions. An input it cannot read that way, such as an interpolated string with a nested string containing a space, can shift the highlighted input.
- The executable grows by the size of `docs/stdlib`, about 120 KB.
