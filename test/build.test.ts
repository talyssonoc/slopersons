import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bundle } from '../scripts/build-binary.ts';
import { defineEntryPointTests } from './helpers/golden.ts';

const directory = mkdtempSync(join(tmpdir(), 'slopersons-bundle-'));
let bundlePath = '';

before(async () => {
  bundlePath = await bundle(directory);
});

after(() => rmSync(directory, { recursive: true, force: true }));

test('the bundle is a single file, with the worker and the standard library inside it', () => {
  assert.deepEqual(readdirSync(directory), ['slopersons.mjs']);
});

defineEntryPointTests('bundle: ', () => [process.execPath, bundlePath]);
