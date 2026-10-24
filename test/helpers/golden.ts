import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BANNER, PROMPT } from '../../src/repl.ts';

const root = fileURLToPath(new URL('../..', import.meta.url));
const GOLDEN_DIRECTORIES = [join(root, 'test/programs'), join(root, 'docs/examples')];

interface GoldenProgram {
  label: string;
  path: string;
}

function readIfExists(path: string): string | null {
  return existsSync(path) ? readFileSync(path, 'utf8') : null;
}

function goldenPrograms(): GoldenProgram[] {
  const programs: GoldenProgram[] = [];
  for (const directory of GOLDEN_DIRECTORIES) {
    const names = readdirSync(directory)
      .filter((name) => name.endsWith('.slop'))
      .sort();
    assert.ok(names.length > 0, `no .slop programs found in ${directory}`);
    for (const name of names) programs.push({ label: `${basename(directory)}/${name}`, path: join(directory, name) });
  }
  return programs;
}

function checkGoldenProgram(command: readonly string[], program: GoldenProgram): void {
  const stem = program.path.slice(0, -'.slop'.length);
  const expectedOut = readIfExists(`${stem}.out`);
  const expectedErr = readIfExists(`${stem}.err`);
  const input = readIfExists(`${stem}.in`) ?? '';
  const argumentLines = readIfExists(`${stem}.args`);
  const programArguments = argumentLines === null ? [] : argumentLines.replace(/\n$/, '').split('\n');
  assert.ok(expectedOut !== null || expectedErr !== null, `${program.label} needs a .out or .err file next to it`);
  const [executable, ...leading] = command;
  assert.ok(executable !== undefined, 'a command needs an executable');
  const cwd = mkdtempSync(join(tmpdir(), 'slopersons-program-'));
  const result = spawnSync(executable, [...leading, program.path, ...programArguments], { encoding: 'utf8', input, cwd });
  assert.equal(result.stdout, expectedOut ?? '');
  assert.equal(result.stderr, (expectedErr ?? '').replaceAll('<file>', program.path));
  assert.equal(result.status, expectedErr === null ? 0 : 1);
}

export function defineGoldenTests(prefix: string, command: () => readonly string[]): void {
  for (const program of goldenPrograms()) test(`${prefix}${program.label} produces its expected output`, () => checkGoldenProgram(command(), program));
}

export function defineEntryPointTests(prefix: string, command: () => readonly string[]): void {
  defineGoldenTests(prefix, command);

  test(`${prefix}deep recursion runs on the worker's large stack`, () => {
    const [executable, ...leading] = command();
    assert.ok(executable !== undefined);
    const program = join(mkdtempSync(join(tmpdir(), 'slopersons-')), 'deep.slop');
    writeFileSync(program, 'proc count n | n = 0 ? 0 : ((n - 1) -> count) + 1\n5000 -> count -> io/print-line\n');
    const result = spawnSync(executable, [...leading, program], { encoding: 'utf8' });
    assert.equal(result.stderr, '');
    assert.equal(result.stdout, '5000\n');
  });

  test(`${prefix}the REPL reads entries from standard input`, () => {
    const [executable, ...leading] = command();
    assert.ok(executable !== undefined);
    const result = spawnSync(executable, [...leading, '--repl'], { encoding: 'utf8', input: '5 + 3\n"\\{\\"a\\": 1\\}" -> json/parse\n' });
    assert.equal(result.stderr, '');
    assert.equal(result.stdout, `${BANNER}${PROMPT}-> 8\n${PROMPT}-> {"a": 1}\n${PROMPT}\n`);
    assert.equal(result.status, 0);
  });
}
