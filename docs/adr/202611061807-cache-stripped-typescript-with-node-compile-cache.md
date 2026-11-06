# Cache stripped TypeScript with Node's compile cache

## Status

Proposed

## Context

The interpreter is TypeScript that Node runs directly, with no build step ([Run TypeScript directly on Node 26 without a build step](./202610231549-run-typescript-directly-on-node-26-without-a-build-step.md)). Node removes the types of each source file when it loads it, with SWC compiled to WebAssembly (`node:internal/deps/amaro`), and a program runs on a worker thread that loads the sources again. Measured on a development machine: Node with an empty script starts in 24 ms; loading `src/cli.ts` and what it imports, 54 files of about 8,600 lines, takes it to 82 ms; running an empty program takes 139 ms, so about 115 ms of every run from a checkout passes before the program starts. The bundled executable, which runs plain JavaScript, runs an empty program in 59 ms.

Node 26 has a compile cache, turned on with `module.enableCompileCache()` or the `NODE_COMPILE_CACHE` environment variable, that keeps both the stripped source and V8's compiled code on disk, keyed by each file's contents. It applies to the thread that turns it on.

## Decision

`bin/slopersons.mjs` turns on the compile cache before it imports `src/cli.ts`, and the worker starts from `src/worker-start.mjs`, which turns it on for its thread before it imports `src/worker.ts`. The cache lives where Node puts it by default, in the operating system's temporary directory, and Node's own `NODE_COMPILE_CACHE` and `NODE_DISABLE_COMPILE_CACHE` still choose its directory or turn it off.

Alternatives considered:

- **Set `NODE_COMPILE_CACHE` for the worker.** One line instead of a second entry file, but a program reads its environment variables from the worker's, so every program would see the variable in `io/environment`.
- **Run the bundle from a checkout too, rebuilding it when a source changes.** About as fast, but it is the build step the earlier decision rejected, and a stale bundle would run old code.
- **Load less on the main thread.** The main thread could leave the interpreter to the worker, but with the cache that saves a few milliseconds at most: an empty program now runs in 69 ms, against 59 ms for the executable.

## Consequences

- An empty program runs in about 69 ms from a checkout instead of 139 ms, and `pnpm test`, which starts the interpreter many times, takes about a fifth less time (8.1 s to 6.3 s).
- The first run after a source file changes strips that file again; nothing has to be rebuilt by hand, and an edited file never runs from a stale cache.
- Each Node version and user gets a directory of a few hundred kilobytes in the temporary directory.
- The executable runs the same entry and is unaffected: its worker is evaluated from embedded source.
- `test/start-up.test.ts` checks, through `NODE_DEBUG_NATIVE=COMPILE_CACHE`, that both threads take their code from the cache, and that turning it on adds no environment variable a program sees.
