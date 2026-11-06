import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const bin = join(root, 'bin/slopersons.mjs');

function run(file: string, environment: NodeJS.ProcessEnv = process.env): { stdout: string; stderr: string; status: number | null } {
  const result = spawnSync(bin, [file], { encoding: 'utf8', timeout: 30_000, env: environment, input: '' });
  return { stdout: result.stdout, stderr: result.stderr, status: result.status };
}

function withProgram(source: string, body: (file: string) => void): void {
  const directory = mkdtempSync(join(tmpdir(), 'slopersons-start-up-'));
  try {
    const file = join(directory, 'program.slop');
    writeFileSync(file, source);
    body(file);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

// Node logs each TypeScript file it takes from the compile cache when NODE_DEBUG_NATIVE names it. Both
// threads load src/cli.ts and only the worker loads src/worker.ts, so a run that uses the cache on both
// logs the first twice and the second once.
test('both threads take their stripped TypeScript from the compile cache on a second run', () => {
  withProgram('1 -> io/print-line', (file) => {
    const debug: NodeJS.ProcessEnv = { ...process.env, NODE_DEBUG_NATIVE: 'COMPILE_CACHE' };
    delete debug['NODE_DISABLE_COMPILE_CACHE'];
    run(file, debug);
    const second = run(file, debug);
    assert.equal(second.status, 0);
    assert.equal(second.stdout, '1\n');
    const hits = (source: string): number => second.stderr.split('\n').filter((line) => line.includes('retrieving transpile cache for StrippedTypeScript') && line.endsWith(`/${source}...success`)).length;
    assert.deepEqual({ cli: hits('src/cli.ts'), worker: hits('src/worker.ts'), interpreter: hits('src/interpreter.ts') }, { cli: 2, worker: 1, interpreter: 2 });
  });
});

test('the compile cache is not among the environment variables a program sees', () => {
  withProgram('(io/environment -> do -> hashmap/keys -> array/keep name | name -> string/starts-with "NODE_") -> io/print-line', (file) => {
    const environment = { ...process.env };
    for (const name of Object.keys(environment)) if (name.startsWith('NODE_')) delete environment[name];
    const result = run(file, environment);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, '[]\n');
  });
});
