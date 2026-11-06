# slopersons

A flow-shaped programming language and its interpreter. See [docs/overview.md](docs/overview.md).

```
pnpm install
pnpm slopersons docs/examples/even-sum.slop
pnpm slopersons --repl
pnpm test
```

Requires Node 26 (see `.tool-versions`). No build step: the interpreter is TypeScript that Node runs directly.

Editor support: `slopersons --lsp` is a language server, and [editors/vscode](editors/vscode/README.md) is a VS Code extension that uses it.
