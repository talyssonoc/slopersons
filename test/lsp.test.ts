import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { diagnosticsFor } from '../src/lsp.ts';
import { defineLanguageServerTests } from './helpers/language-server.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const bin = join(root, 'bin/slopersons.mjs');

function ranges(source: string): Array<[number, number, number, string]> {
  return diagnosticsFor(source).map((diagnostic) => [diagnostic.range.start.line, diagnostic.range.start.character, diagnostic.range.end.character, typeof diagnostic.message === 'string' ? diagnostic.message : diagnostic.message.value]);
}

test('a diagnostic covers the whole name the error points at', () => {
  assert.deepEqual(ranges('1 => geometry/pi'), [[0, 5, 16, 'expected a name after `=>`']]);
});

test('an error at the end of a line covers its last character', () => {
  assert.deepEqual(ranges('5 => x\nx ->'), [[1, 3, 4, 'expected a procedure name after `->`, found end of line']]);
  assert.deepEqual(ranges('1 +'), [[0, 2, 3, 'expected a value, found end of line']]);
});

test('an error at a symbol covers that symbol', () => {
  assert.deepEqual(ranges('"open'), [[0, 0, 1, 'unterminated string']]);
});

test('each broken top-level statement gets its own diagnostic, and a valid file gets none', () => {
  assert.deepEqual(
    ranges('1 +\n2 => y\nx ->'),
    [
      [0, 2, 3, 'expected a value, found end of line'],
      [2, 3, 4, 'expected a procedure name after `->`, found end of line'],
    ],
  );
  assert.deepEqual(diagnosticsFor('[1 2 3] -> array/each n\n| n -> io/print-line'), []);
  assert.equal(diagnosticsFor('x ->')[0]?.source, 'slopersons');
});

test('--lsp accepts only --stdio after it', () => {
  const result = spawnSync(bin, ['--lsp', 'file.slop'], { encoding: 'utf8', timeout: 30_000 });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /--lsp takes no file or arguments other than --stdio/);
});

defineLanguageServerTests('', () => [bin]);
