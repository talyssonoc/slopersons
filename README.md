# slopersons

A flow-shaped programming language and its interpreter. See [docs/overview.md](docs/overview.md).

```
pnpm install
./bin/slopersons.mjs docs/examples/even-sum.slop
pnpm test
```

Requires Node 26 (see `.tool-versions`). No build step: the interpreter is TypeScript that Node runs directly.
