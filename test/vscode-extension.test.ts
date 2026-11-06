import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const extension = fileURLToPath(new URL('../editors/vscode/', import.meta.url));
const binaries = join(extension, 'node_modules', '.bin');
const installed = existsSync(binaries);
const skip = installed ? false : 'the extension has no dependencies installed; run `pnpm install` in editors/vscode';

function run(binary: string, inputs: string[]): void {
  const result = spawnSync(join(binaries, binary), inputs, { cwd: extension, encoding: 'utf8', timeout: 120_000 });
  assert.equal(result.error, undefined, `${binary} could not run: ${result.error?.message}`);
  assert.equal(result.status, 0, `${binary} ${inputs.join(' ')} failed:\n${result.stdout}${result.stderr}`);
}

test('the VS Code extension typechecks against the versions of vscode and vscode-languageclient it depends on', { skip, timeout: 150_000 }, () => {
  run('tsc', ['--noEmit']);
});

// The bundle is written to a temporary folder with the flags of the extension's own build script, so the
// test checks what `pnpm build` does without replacing dist/extension.js.
test('the VS Code extension bundles with its build script, leaving only vscode to the editor', { skip, timeout: 150_000 }, () => {
  const manifest = JSON.parse(readFileSync(join(extension, 'package.json'), 'utf8')) as { scripts: { build: string } };
  const [command, ...flags] = manifest.scripts.build.split(' ');
  assert.equal(command, 'esbuild');
  assert.ok(flags.includes('--outfile=dist/extension.js'), manifest.scripts.build);
  const directory = mkdtempSync(join(tmpdir(), 'slopersons-extension-'));
  try {
    const bundle = join(directory, 'extension.js');
    run('esbuild', [...flags.filter((flag) => !flag.startsWith('--outfile=')), `--outfile=${bundle}`]);
    assert.ok(statSync(bundle).size > 0);
    const required = [...readFileSync(bundle, 'utf8').matchAll(/require\("([^"]+)"\)/g)].map((match) => match[1] ?? '');
    assert.deepEqual([...new Set(required.filter((name) => !name.startsWith('node:') && !builtinModules.includes(name)))], ['vscode']);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
