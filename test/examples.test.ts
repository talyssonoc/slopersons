import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startProgramFile, within } from './helpers/network.ts';

const bin = fileURLToPath(new URL('../bin/slopersons.mjs', import.meta.url));
const usersExample = fileURLToPath(new URL('../docs/examples/users.slop', import.meta.url));
const notesExample = fileURLToPath(new URL('../docs/examples/notes/notes.slop', import.meta.url));
const passwordsExample = fileURLToPath(new URL('../docs/examples/passwords/passwords.slop', import.meta.url));

const WELCOME = 'Welcome to the user registry.\n';
const CHOICE = 'Register, list or quit? (r/l/q): ';

function session(directory: string, input: string): { out: string; error: string; code: number | null } {
  const result = spawnSync(bin, [usersExample], { encoding: 'utf8', timeout: 30_000, cwd: directory, input });
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

test('the notes example serves its pages, keeps notes added from the form, and stops with Ctrl-C', { timeout: 30_000 }, async () => {
  const program = startProgramFile([bin], notesExample, ['0']);
  try {
    const banner = await program.firstLine;
    const base = /http:\/\/127\.0\.0\.1:\d+/.exec(banner)?.[0];
    assert.ok(base !== undefined, `no address in ${JSON.stringify(banner)}`);
    assert.equal(banner, `Notes running at ${base} (Ctrl-C to stop)`);

    const empty = await fetch(`${base}/`);
    assert.equal(empty.headers.get('content-type'), 'text/html; charset=utf-8');
    assert.match(await empty.text(), /<li><em>No notes yet\.<\/em><\/li>/);

    const added = await fetch(`${base}/notes`, { method: 'POST', body: new URLSearchParams({ text: '  Buy <milk> & eggs  ' }), redirect: 'manual' });
    assert.equal(added.status, 303);
    assert.equal(added.headers.get('location'), '/');
    const blank = await fetch(`${base}/notes`, { method: 'POST', body: new URLSearchParams({ text: '   ' }) });
    assert.equal(blank.status, 400);
    await blank.text();

    assert.match(await (await fetch(`${base}/`)).text(), /<li>Buy &lt;milk&gt; &amp; eggs <small>\d{4}-\d{2}-\d{2}T[\d:.]+<\/small><\/li>/);
    const notes = (await (await fetch(`${base}/api/notes`)).json()) as { id: number; text: string }[];
    assert.deepEqual(
      notes.map(({ id, text }) => ({ id, text })),
      [{ id: 1, text: 'Buy <milk> & eggs' }],
    );
    assert.equal(await (await fetch(`${base}/hello?name=Ada&name=Grace`)).text(), 'Hello, Ada and Grace!');
    assert.equal(await (await fetch(`${base}/hello`)).text(), 'Hello, stranger!');
    assert.equal((await fetch(`${base}/missing`)).status, 404);

    program.child.kill('SIGINT');
    const finished = await within(program.finished, 10_000, 'the notes example to stop');
    assert.equal(finished.code, 130);
    assert.equal(finished.stderr, '');
    assert.equal(
      finished.stdout,
      `${banner}\nGET / -> 200\nPOST /notes -> 303\nPOST /notes -> 400\nGET / -> 200\nGET /api/notes -> 200\nGET /hello?name=Ada&name=Grace -> 200\nGET /hello -> 200\nGET /missing -> 404\n`,
    );
  } finally {
    program.child.kill();
  }
});

function passwords(settings: Record<string, string>): { lines: string[]; error: string; code: number | null } {
  const environment: NodeJS.ProcessEnv = { ...process.env };
  delete environment['PASSWORD_LENGTH'];
  delete environment['PASSWORD_COUNT'];
  const result = spawnSync(bin, [passwordsExample], { encoding: 'utf8', timeout: 30_000, env: { ...environment, ...settings } });
  return { lines: result.stdout.split('\n').slice(0, -1), error: result.stderr, code: result.status };
}

function assertPassword(password: string, length: number): void {
  assert.equal(password.length, length, `${password} has the wrong length`);
  assert.match(password, /^[A-Za-z0-9!#$%&*+\-=?@^_~]+$/);
  for (const kind of [/[a-z]/, /[A-Z]/, /[0-9]/, /[!#$%&*+\-=?@^_~]/]) assert.match(password, kind);
}

test('the passwords example makes three passwords of 16 characters and a token by default', () => {
  const { lines, error, code } = passwords({});
  assert.equal(error, '');
  assert.equal(code, 0);
  assert.equal(lines.length, 4);
  for (const password of lines.slice(0, 3)) assertPassword(password, 16);
  assert.equal(new Set(lines.slice(0, 3)).size, 3);
  assert.match(lines[3] ?? '', /^token: [0-9a-f]{32}$/);
});

// Without the shuffle, the four characters picked one from each kind would always come first
// and in the same order. With it, all 20 starting with a lowercase letter has odds of 4^-20.
test('the passwords example takes its length and count from environment variables, and shuffles', () => {
  const { lines, code } = passwords({ PASSWORD_LENGTH: '4', PASSWORD_COUNT: '20' });
  assert.equal(code, 0);
  assert.equal(lines.length, 21);
  for (const password of lines.slice(0, 20)) assertPassword(password, 4);
  assert.ok(lines.slice(0, 20).some((password) => !/^[a-z]/.test(password)), 'every password starts with a lowercase letter');
});

test('the passwords example refuses settings it cannot use', () => {
  assert.deepEqual(passwords({ PASSWORD_LENGTH: '3' }), { lines: [], error: 'PASSWORD_LENGTH must be at least 4, to fit one character of each kind, got 3\n', code: 2 });
  assert.deepEqual(passwords({ PASSWORD_COUNT: 'lots' }), { lines: [], error: 'PASSWORD_COUNT must be a whole number, got "lots"\n', code: 2 });
  assert.deepEqual(passwords({ PASSWORD_COUNT: '0' }), { lines: [], error: 'PASSWORD_COUNT must be at least 1, got 0\n', code: 2 });
});
