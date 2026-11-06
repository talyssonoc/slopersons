#!/usr/bin/env node
import { enableCompileCache } from 'node:module';

// Node strips the types of every source file at each start, on the main thread and again in the worker.
// The compile cache keeps the result on disk, keyed by each file's contents, which halves start-up.
enableCompileCache();
const { main } = await import('../src/cli.ts');

try {
  process.exitCode = await main(process.argv.slice(2));
} catch {
  process.stderr.write('error: internal interpreter error; this is a bug in slopersons, not in your program\n');
  process.exitCode = 70;
}
