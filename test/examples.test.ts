import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const bin = fileURLToPath(new URL('../bin/slopersons.mjs', import.meta.url));
const usersExample = fileURLToPath(new URL('../docs/examples/users.slop', import.meta.url));

function users(directory: string, ...words: string[]): { out: string; error: string; code: number | null } {
  const result = spawnSync(bin, [usersExample, ...words], { encoding: 'utf8', cwd: directory });
  return { out: result.stdout, error: result.stderr, code: result.status };
}

const USAGE = 'usage: slopersons users.slop add <name> <yyyy-mm-dd>\n       slopersons users.slop list\n';

test('the users example keeps its registry in users.json from one run to the next', () => {
  const directory = mkdtempSync(join(tmpdir(), 'slopersons-users-'));
  assert.deepEqual(users(directory, 'list'), { out: 'no users registered yet\n', error: '', code: 0 });
  assert.deepEqual(users(directory, 'add', 'Ada Lovelace', '1815-12-10'), { out: 'registered #1: Ada Lovelace, born 1815-12-10\n', error: '', code: 0 });
  assert.deepEqual(users(directory, 'add', '  Alan Turing ', '1912-06-23'), { out: 'registered #2: Alan Turing, born 1912-06-23\n', error: '', code: 0 });
  assert.deepEqual(users(directory, 'list'), { out: '#1    Ada Lovelace  1815-12-10\n#2    Alan Turing   1912-06-23\n', error: '', code: 0 });
  assert.deepEqual(JSON.parse(readFileSync(join(directory, 'users.json'), 'utf8')), {
    'next-id': 3,
    users: [
      { id: 1, name: 'Ada Lovelace', birthday: '1815-12-10' },
      { id: 2, name: 'Alan Turing', birthday: '1912-06-23' },
    ],
  });
  assert.equal(existsSync(join(directory, 'users.json.tmp')), false);
});

test('the users example refuses bad input without creating or changing the registry', () => {
  const directory = mkdtempSync(join(tmpdir(), 'slopersons-users-'));
  assert.deepEqual(users(directory, 'add', '  ', '2000-01-01'), { out: '', error: 'users: the name cannot be empty\n', code: 1 });
  assert.deepEqual(users(directory, 'add', 'Bob', '2000-13-01'), { out: '', error: 'users: the birthday must be a date written as yyyy-mm-dd, got "2000-13-01"\n', code: 1 });
  assert.deepEqual(users(directory, 'add', 'Bob', '3000-01-01'), { out: '', error: 'users: a birthday cannot be in the future\n', code: 1 });
  assert.deepEqual(users(directory), { out: '', error: USAGE, code: 2 });
  assert.deepEqual(users(directory, 'add', 'Bob'), { out: '', error: USAGE, code: 2 });
  assert.deepEqual(users(directory, 'remove', '1'), { out: '', error: USAGE, code: 2 });
  assert.equal(existsSync(join(directory, 'users.json')), false);
});

test('the users example leaves a registry it cannot read exactly as it found it', () => {
  const directory = mkdtempSync(join(tmpdir(), 'slopersons-users-'));
  const damaged = '{"next-id": 1, "users": [';
  writeFileSync(join(directory, 'users.json'), damaged);
  assert.deepEqual(users(directory, 'add', 'Bob', '2000-01-01'), {
    out: '',
    error: 'users: users.json cannot be read, so it was left untouched: invalid JSON at offset 25: expected a value, found the end of the text\n',
    code: 1,
  });
  assert.equal(readFileSync(join(directory, 'users.json'), 'utf8'), damaged);
});
