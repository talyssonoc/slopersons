import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { basename, dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const bin = join(root, 'bin/slopersons.mjs');
const directories = [join(root, 'test/programs'), join(root, 'docs/examples')];

function readIfExists(path: string): string | null {
  return existsSync(path) ? readFileSync(path, 'utf8') : null;
}

for (const directory of directories) {
  const programs = readdirSync(directory)
    .filter((name) => name.endsWith('.slop'))
    .sort();
  assert.ok(programs.length > 0, `no .slop programs found in ${directory}`);
  for (const name of programs) {
    const path = join(directory, name);
    const stem = path.slice(0, -'.slop'.length);
    test(`${basename(directory)}/${name} produces its expected output`, () => {
      const expectedOut = readIfExists(`${stem}.out`);
      const expectedErr = readIfExists(`${stem}.err`);
      const input = readIfExists(`${stem}.in`) ?? '';
      const argumentLines = readIfExists(`${stem}.args`);
      const programArguments = argumentLines === null ? [] : argumentLines.replace(/\n$/, '').split('\n');
      assert.ok(expectedOut !== null || expectedErr !== null, `${name} needs a .out or .err file next to it`);
      const result = spawnSync(bin, [path, ...programArguments], { encoding: 'utf8', input });
      assert.equal(result.stdout, expectedOut ?? '');
      assert.equal(result.stderr, (expectedErr ?? '').replaceAll('<file>', path));
      assert.equal(result.status, expectedErr === null ? 0 : 1);
    });
  }
}
