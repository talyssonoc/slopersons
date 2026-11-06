# Serve editors from a language server in the slopersons executable

## Status

Proposed

## Context

The TextMate grammar in `editors/vscode/` ([Ship a TextMate grammar inside the interpreter repository](./202611061056-ship-a-textmate-grammar-inside-the-interpreter-repository.md)) highlights `.slop` files but cannot report errors: only the parser in `src/parser.ts` knows whether a file parses. Without editor support, a program's parse errors appear only when it runs, one at a time.

Error reporting, and later features such as hover or semantic highlighting, can reach an editor in two ways. Code inside a VS Code extension can call the parser directly, or a separate process can speak the Language Server Protocol (LSP), which VS Code, Neovim, Helix, Zed and other editors understand. The interpreter runs its TypeScript sources with Node 26, with no build step. An extension runs inside VS Code's own Node, so calling the parser from one would need a bundle of the parser for that runtime.

Anyone editing slopersons already has the interpreter: `bin/slopersons.mjs` in a checkout, or `dist/slopersons` from `pnpm build`. Until now, the interpreter had no runtime dependencies.

The protocol covers framing, an initialize handshake, document synchronization, cancellation and shutdown. Microsoft's `vscode-languageserver` package (11.0.0, released 2026-10-22, with `vscode-languageserver-protocol` 3.18.5) implements it, and is what the VS Code client, `vscode-languageclient`, is tested against.

## Decision

The interpreter serves editors as an LSP server started with `slopersons --lsp`. `--stdio` may follow, because clients add it. The server is `src/lsp.ts`, built on `vscode-languageserver` and `vscode-languageserver-textdocument`, and reads and writes standard input and output on the main thread; it runs no program, so it needs no worker. `src/cli.ts` loads it with a dynamic import, so running a program never loads the library. The first feature is diagnostics for parse errors; it advertises full document synchronization and nothing else.

The VS Code extension in `editors/vscode/` becomes a thin client: `vscode-languageclient` starts the command in the `slopersons.server.path` setting with `--lsp`. The extension has its own `package.json` and lockfile and is bundled with esbuild into `dist/extension.js`.

Alternatives considered:

- **A semantic tokens provider inside the extension, without a server.** Fewer parts and easier debugging. But it serves only VS Code, needs the parser bundled for VS Code's runtime anyway, and every later feature (diagnostics, hover, definitions) would grow it into an ad hoc server.
- **A separate language server package.** It could release apart from the interpreter, but it would carry its own copy of the parser and could disagree with what `slopersons` accepts. Inside the executable, the server and the interpreter cannot drift apart.
- **Writing the protocol by hand.** Diagnostics need perhaps 200 lines of framing and lifecycle, and the interpreter would keep zero runtime dependencies. But every later feature adds protocol surface, the edge cases (cancellation, partial results, client capabilities) are where hand-written servers fail, and the library is maintained by the authors of the client the extension uses.

## Consequences

- Any editor with an LSP client can use `slopersons --lsp`. Only VS Code has a ready-made client, in `editors/vscode/`.
- `vscode-languageserver` and `vscode-languageserver-textdocument` are the interpreter's first runtime dependencies. They are bundled into `dist/slopersons`.
- The library ends the process with `process.exit`: on the protocol's `exit` notification, when standard input closes, and when the editor's process is gone. This is the one exception to the rule that slopersons never calls `process.exit` (invariant 6 in `AGENTS.md`). It writes no program output, so nothing buffered is lost. `src/lsp.ts` returns a promise that never settles.
- The library is CommonJS and requires Node's modules at run time. The ES module bundle in `scripts/build-binary.ts` therefore defines `require` in a banner. `test/build.test.ts` and `pnpm test:binary` run an LSP session through the bundle and the executable, so losing the banner fails a test.
- The VS Code extension now has code, dependencies and a build. `pnpm test` in `core/` tests the server and the grammar, not the client.
- The extension needs a `slopersons` it can start. Running `bin/slopersons.mjs` needs Node 26 on VS Code's `PATH`; the standalone executable does not.
- Follow-up decisions: semantic tokens for what the grammar cannot mark (block-form lambda parameters, the `:` in a hashmap), which needs positions for parameters in the AST; and whether diagnostics should go beyond parse errors.
