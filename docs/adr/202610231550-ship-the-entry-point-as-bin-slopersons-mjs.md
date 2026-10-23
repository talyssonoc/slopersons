# Ship the entry point as `bin/slopersons.mjs`

## Status

Accepted

## Context

Extensionless files under a `"type": "module"` package have thrown `ERR_UNKNOWN_FILE_EXTENSION` in Node.

## Decision

The shebang entry file keeps its `.mjs` extension, and the `bin` field in `package.json` exposes it as the bare `slopersons` command. A package script `pnpm slopersons` runs it too.

## Consequences

- From a checkout the command is `./bin/slopersons.mjs`; after `pnpm link --global` it is `slopersons`.
