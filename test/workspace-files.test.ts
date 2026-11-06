import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { slopFilesUnder } from '../src/cli.ts';

test('the workspace holds every .slop file under a folder, except in hidden folders and installed packages', () => {
  const directory = mkdtempSync(join(tmpdir(), 'slopersons-workspace-'));
  try {
    for (const folder of ['lib', 'my lib', '.git', 'node_modules/package']) mkdirSync(join(directory, folder), { recursive: true });
    for (const file of ['main.slop', 'notes.txt', 'lib/geometry.slop', 'my lib/text.slop', '.git/old.slop', 'node_modules/package/copy.slop', '.hidden.slop']) {
      writeFileSync(join(directory, file), '');
    }
    const found = slopFilesUnder(pathToFileURL(directory).href).map((uri) => uri.slice(pathToFileURL(directory).href.length)).sort();
    assert.deepEqual(found, ['/lib/geometry.slop', '/main.slop', '/my%20lib/text.slop']);
    assert.deepEqual(slopFilesUnder(pathToFileURL(join(directory, 'missing')).href), []);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
