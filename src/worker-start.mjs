import { enableCompileCache } from 'node:module';

// The compile cache applies to the thread that enables it, so the worker enables it before loading its
// TypeScript, as bin/slopersons.mjs does for the main thread.
enableCompileCache();
await import('./worker.ts');
