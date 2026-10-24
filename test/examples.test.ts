import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const bin = fileURLToPath(new URL('../bin/slopersons.mjs', import.meta.url));
const usersExample = fileURLToPath(new URL('../docs/examples/users.slop', import.meta.url));

const WELCOME = 'Welcome to the user registry.\n';
const CHOICE = 'Register, list or quit? (r/l/q): ';

function session(directory: string, input: string): { out: string; error: string; code: number | null } {
  const result = spawnSync(bin, [usersExample], { encoding: 'utf8', cwd: directory, input });
  return { out: result.stdout, error: result.stderr, code: result.status };
}

test('the users example keeps its registry in users.json from one session to the next', () => {
  const directory = mkdtempSync(join(tmpdir(), 'slopersons-users-'));
  assert.deepEqual(session(directory, 'r\nAda Lovelace\n1815-12-10\nq\n'), {
    out: `${WELCOME}${CHOICE}Name: Birthday (yyyy-mm-dd): Registered #1: Ada Lovelace, born 1815-12-10.\n${CHOICE}Goodbye.\n`,
    error: '',
    code: 0,
  });
  assert.deepEqual(session(directory, 'r\nAlan Turing\n1912-06-23\nl\nq\n'), {
    out: `${WELCOME}${CHOICE}Name: Birthday (yyyy-mm-dd): Registered #2: Alan Turing, born 1912-06-23.\n${CHOICE}#1    Ada Lovelace  1815-12-10\n#2    Alan Turing   1912-06-23\n${CHOICE}Goodbye.\n`,
    error: '',
    code: 0,
  });
  assert.deepEqual(JSON.parse(readFileSync(join(directory, 'users.json'), 'utf8')), {
    'next-id': 3,
    users: [
      { id: 1, name: 'Ada Lovelace', birthday: '1815-12-10' },
      { id: 2, name: 'Alan Turing', birthday: '1912-06-23' },
    ],
  });
  assert.equal(existsSync(join(directory, 'users.json.tmp')), false);
});

test('input that ends in the middle of a registration saves nothing', () => {
  const directory = mkdtempSync(join(tmpdir(), 'slopersons-users-'));
  assert.deepEqual(session(directory, 'r\nGrace Hopper\n'), { out: `${WELCOME}${CHOICE}Name: Birthday (yyyy-mm-dd): Goodbye.\n`, error: '', code: 0 });
  assert.equal(existsSync(join(directory, 'users.json')), false);
});

test('the users example leaves a registry it cannot read exactly as it found it', () => {
  const directory = mkdtempSync(join(tmpdir(), 'slopersons-users-'));
  const damaged = '{"next-id": 1, "users": [';
  writeFileSync(join(directory, 'users.json'), damaged);
  assert.deepEqual(session(directory, 'l\nq\n'), {
    out: '',
    error: 'users.json cannot be read, so it was left untouched: invalid JSON at offset 25: expected a value, found the end of the text\n',
    code: 1,
  });
  assert.equal(readFileSync(join(directory, 'users.json'), 'utf8'), damaged);
});
