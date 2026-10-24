import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildExecutable } from '../scripts/build-binary.ts';
import { defineEntryPointTests } from './helpers/golden.ts';

if (process.env['SLOPERSONS_TEST_BINARY'] !== '1') {
  test('the standalone executable', { skip: 'building it copies the Node runtime (about 150 MB); run pnpm test:binary' }, () => {});
} else {
  const directory = mkdtempSync(join(tmpdir(), 'slopersons-binary-'));
  let executable = '';

  before(async () => {
    executable = await buildExecutable(join(directory, 'slopersons'));
  });

  after(() => rmSync(directory, { recursive: true, force: true }));

  test('binary: --version reports the interpreter version', () => {
    const result = spawnSync(executable, ['--version'], { encoding: 'utf8' });
    assert.match(result.stdout, /^slopersons \d+\.\d+\.\d+\n$/);
    assert.equal(result.status, 0);
  });

  defineEntryPointTests('binary: ', () => [executable]);
}
