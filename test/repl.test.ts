import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterpreter } from '../src/cli.ts';
import { BANNER, CONTINUATION_PROMPT, PROMPT, Repl } from '../src/repl.ts';
import { fakeIo } from './helpers/run.ts';

function session(lines: string[]): { out: string; err: string; code: number } {
  const io = fakeIo(lines);
  const code = new Repl(io, createInterpreter(io)).run();
  return { out: io.out, err: io.error, code };
}

const P = PROMPT;
const C = CONTINUATION_PROMPT;

test('a complete line runs at once and its value is echoed in show form', () => {
  const result = session(['5 + 3', '"hi"', '`a`']);
  assert.equal(result.out, `${BANNER}${P}-> 8\n${P}-> "hi"\n${P}-> \`a\`\n${P}\n`);
  assert.equal(result.err, '');
  assert.equal(result.code, 0);
});

test('printed output and the echo both appear, and nothing is not echoed', () => {
  const result = session(['"hi" -> io/print-line', 'proc f | 1', 'nothing']);
  assert.equal(result.out, `${BANNER}${P}hi\n-> "hi"\n${P}${P}${P}\n`);
});

test('file streams opened in a session are written when the session ends', () => {
  const path = join(mkdtempSync(join(tmpdir(), 'slopersons-')), 'session.txt');
  const result = session([`"${path}" -> file/open "write" => log`, 'log -> stream/write "kept"']);
  assert.equal(result.code, 0);
  assert.equal(readFileSync(path, 'utf8'), 'kept');
});

test('io/arguments is empty in the REPL', () => {
  const result = session(['io/arguments -> do']);
  assert.equal(result.out, `${BANNER}${P}-> []\n${P}\n`);
});

test('bindings and procedures persist across entries', () => {
  const result = session(['5 => x', 'proc double n | n * 2', 'x -> double']);
  assert.equal(result.out, `${BANNER}${P}-> 5\n${P}${P}-> 10\n${P}\n`);
});

test('an incomplete line collects a block until an empty line', () => {
  const result = session(['proc double n', '| n * 2', '', '21 -> double']);
  assert.equal(result.out, `${BANNER}${P}${C}${C}${P}-> 42\n${P}\n`);
  const conditional = session(['1 > 0 ?', '| "big"', ': "small"', '']);
  assert.equal(conditional.out, `${BANNER}${P}${C}${C}${C}-> "big"\n${P}\n`);
  const attempt = session(['attempt', '| 1 / 0', 'recover e', '| e -> error/message', '']);
  const cleanup = session(['attempt', '| 1 / 0', 'always', '| "cleanup" -> io/print-line', '']);
  assert.equal(cleanup.out, `${BANNER}${P}${C}${C}${C}${C}cleanup\n${P}\n`);
  assert.equal(cleanup.err, 'error: division by zero\n  at <repl>:2:5\n');
  assert.equal(attempt.out, `${BANNER}${P}${C}${C}${C}${C}-> "division by zero"\n${P}\n`);
});

test('a call ending in unbound names waits for a block, a bound name runs at once', () => {
  const waits = session(['[1 2] -> array/each n', '| n -> io/print-line', '']);
  assert.equal(waits.out, `${BANNER}${P}${C}${C}1\n2\n${P}\n`);
  const runs = session(['[1 2] => xs', '7 => item', 'xs -> array/push item']);
  assert.equal(runs.out, `${BANNER}${P}-> [1 2]\n${P}-> 7\n${P}-> [1 2 7]\n${P}\n`);
  const unknown = session(['[1] -> array/push y', '']);
  assert.equal(unknown.err, 'error: unknown name `y`\n  at <repl>:1:19\n');
});

test('errors report the position inside the entry and the session continues', () => {
  const result = session(['1 / 0', 'x -1', 'proc f n', '| n -> nope', '', '"still here"']);
  assert.equal(result.err, 'error: division by zero\n  at <repl>:1:3\nerror: unexpected `-`; binary operators need spaces on both sides\n  at <repl>:1:3\n');
  assert.equal(result.out, `${BANNER}${P}${P}${P}${C}${C}${P}-> "still here"\n${P}\n`);
});

test('a runtime error inside a block entry points at its line within the entry', () => {
  const result = session(['proc f n', '| n -> nope', '', '1 -> f']);
  assert.equal(result.err, 'error: unknown name `nope`\n  at <repl>:2:8\n');
});

test('brackets spanning lines form one entry, and a pending entry runs at end of input', () => {
  const result = session(['(1 +', '2) -> io/print-line']);
  assert.equal(result.out, `${BANNER}${P}${C}${C}\n3\n-> 3\n`);
  assert.equal(result.code, 0);
});

test('exit ends the session with its code without reading further lines', () => {
  const result = session(['"before" -> io/print-line', '3 -> exit', '"after" -> io/print-line']);
  assert.equal(result.out, `${BANNER}${P}before\n-> "before"\n${P}`);
  assert.equal(result.code, 3);
});

test('empty lines outside a block are ignored', () => {
  const result = session(['', '   ', '1']);
  assert.equal(result.out, `${BANNER}${P}${P}${P}-> 1\n${P}\n`);
});
