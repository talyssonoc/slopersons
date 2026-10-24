# Package a standalone executable with esbuild and Node's `--build-sea`

## Status

Accepted

## Context

Running slopersons needs Node 26 and a checkout of this repository. A single `slopersons` binary, built by a package script with Node's single executable applications, would run on a machine that has neither. The interpreter runs as TypeScript straight from the checkout ([Run TypeScript directly on Node 26 without a build step](./202610231549-run-typescript-directly-on-node-26-without-a-build-step.md)), and three things in it assume source files on disk. The CLI starts its worker from `src/worker.ts` ([Run programs on a worker thread with a 256 MB stack](./202610231558-run-programs-on-a-worker-thread-with-a-256-mb-stack.md)). The `json` and `test` modules are read from `src/stdlib/*.slop` at startup. And the entry point imports `.ts` files. In Node 26.12.1 the executable embeds a single script, whose `import` and `require` "only load the built-in modules". The documentation says nothing about worker threads inside such an executable.

## Decision

- `pnpm build` runs `scripts/build-binary.ts`, which writes `dist/slopersons` (git-ignored). Development keeps running the sources with no build.
- esbuild, a new devDependency, makes two bundles:
  - `src/worker.ts` as CommonJS, kept in memory;
  - `bin/slopersons.mjs` as an ES module.
- Two global names become build-time constants through esbuild's `define`, and both are undefined in a checkout:
  - `SLOPERSONS_WORKER_SOURCE` holds the worker bundle. `src/cli.ts` starts the worker from it with `eval: true`, keeping the same 256 MB stack and heap limit.
  - `SLOPERSONS_SOURCE_MODULES` holds the text of every `src/stdlib/*.slop`. `standardSourceModule` in `src/modules.ts` returns it.

  Checking them with `typeof` lets the same code run from the checkout and from the executable. `registerSourceModule` now takes source text instead of a URL.
- The executable's main script uses `"mainFormat": "module"`, so the entry point's top-level `await` stays. The generated `sea-config.json` disables the experimental warning. `node --build-sea` runs with the Node that runs the build, and on macOS the result is signed ad hoc with `codesign --sign -`.
- `pnpm test` bundles into a temporary directory and runs every golden program, a 5000-deep recursion and a REPL session through the bundle. `pnpm test:binary` does the same through a freshly built executable, which is left out of `pnpm test` because each build copies the 146 MB Node runtime.

Rejected:

- Embedding the worker and the `.slop` files as SEA `assets`: whether a worker can read them is not documented, while constants compiled into both bundles work the same in either thread.
- `"useVfs"` to embed the source tree: it is at stability 1.0, early development, in Node 26.12.1.
- The manual `--experimental-sea-config` and `postject` steps: Node 26 builds and injects in one step.
- Dropping the worker and passing `--stack-size` through `execArgv`: it segfaults when the value exceeds the operating system's thread stack, which is why the worker exists.
- A CommonJS main script: the entry point would lose top-level `await` and `import.meta`.
- pkg, nexe or `bun build --compile`: they ship a different runtime from the Node 26 the interpreter is developed and tested on.

## Consequences

- The executable is about 150 MB and runs without Node. It only targets the platform, processor and Node version that built it.
- Single executable applications are still experimental in Node, so the build may need changes as Node evolves; `pnpm test:binary` is the check to run after upgrading Node.
- Two names in `src/` are set only by the build. A new source module in `src/stdlib/` is embedded automatically.
