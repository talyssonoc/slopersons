import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterpreter, runProgram } from '../src/cli.ts';
import { EXIT_INTERRUPTED, type Interruption } from '../src/interpreter.ts';
import { BANNER, PROMPT } from '../src/repl.ts';
import { listeningPort, openClient, startProgram } from './helpers/network.ts';
import { fakeIo } from './helpers/run.ts';

const bin = fileURLToPath(new URL('../bin/slopersons.mjs', import.meta.url));
const TIMEOUT = { timeout: 20_000 };

function pause(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function interruptAfter(checks: number): Interruption {
  let count = 0;
  return { take: () => ++count === checks };
}

function runInterrupted(source: string): { code: number; out: string; error: string } {
  const io = fakeIo();
  const code = runProgram(source, 'test.slop', io, createInterpreter(io, { interruption: interruptAfter(500) }));
  return { code, out: io.out, error: io.error };
}

function scratchFile(): string {
  const path = join(mkdtempSync(join(tmpdir(), 'slopersons-interrupt-')), 'saved.txt');
  assert.doesNotMatch(path, /["\\{}]/, 'the path goes inside a slopersons string literal unescaped');
  return path;
}

test('an interruption stops a while loop that makes no calls, and the program exits with 130', () => {
  const result = runInterrupted('0 => n\nwhile n < 1000000\n| n + 1 => n\n"finished" -> io/print-line\n');
  assert.deepEqual(result, { code: EXIT_INTERRUPTED, out: '', error: '' });
});

test('an interruption stops a program between procedure calls', () => {
  const result = runInterrupted('1 -> int/up-to 1000000 -> array/each i | i\n"finished" -> io/print-line\n');
  assert.deepEqual(result, { code: EXIT_INTERRUPTED, out: '', error: '' });
});

test('an interruption is not an error: attempt does not catch it and always does not run, as with exit', () => {
  const result = runInterrupted('attempt\n| 1 -> int/up-to 1000000 -> array/each i | i\nrecover problem\n| "caught" -> io/print-line\nalways\n| "cleanup" -> io/print-line\n');
  assert.deepEqual(result, { code: EXIT_INTERRUPTED, out: '', error: '' });
});

test('an interrupted program still runs end hooks and writes out its open streams, keeping the exit code 130', () => {
  const path = scratchFile();
  const source = `"${path}" -> file/open "write" -> stream/write "kept"\n"passes" -> test/it\n| 1 -> test/assert 1\n1 -> int/up-to 1000000 -> array/each i | i\n`;
  const result = runInterrupted(source);
  assert.equal(result.code, EXIT_INTERRUPTED);
  assert.match(result.out, /1 passed, 0 failed\n$/);
  assert.equal(readFileSync(path, 'utf8'), 'kept');
});

async function interruptWhenReady(source: string): Promise<{ code: number | null; stdout: string; stderr: string; saved: string }> {
  const path = scratchFile();
  const program = startProgram([bin], `"${path}" -> file/open "write" -> stream/write "kept"\n"passes" -> test/it\n| 1 -> test/assert 1\n${source}`);
  try {
    await program.printed('ready\n');
    await pause(200);
    program.child.kill('SIGINT');
    const finished = await program.finished;
    return { ...finished, saved: readFileSync(path, 'utf8') };
  } finally {
    program.child.kill();
  }
}

const SUMMARY = '✓ passes\nready\n\n1 passed, 0 failed\n';

test('Ctrl-C ends a busy program with 130, after printing the test summary and writing out its open streams', TIMEOUT, async () => {
  const result = await interruptWhenReady('"ready" -> io/print-line\nwhile yes\n| 1 => x\n');
  assert.deepEqual(result, { code: EXIT_INTERRUPTED, stdout: SUMMARY, stderr: '', saved: 'kept' });
});

test('Ctrl-C ends a program waiting for a line of standard input', TIMEOUT, async () => {
  const result = await interruptWhenReady('"ready" -> io/print-line\nio/read-line -> do\n"after" -> io/print-line\n');
  assert.deepEqual(result, { code: EXIT_INTERRUPTED, stdout: SUMMARY, stderr: '', saved: 'kept' });
});

test('Ctrl-C ends a server waiting for a client', TIMEOUT, async () => {
  const result = await interruptWhenReady('"127.0.0.1" -> socket/listen 0 => listener\n"ready" -> io/print-line\nlistener -> socket/accept\n"after" -> io/print-line\n');
  assert.deepEqual(result, { code: EXIT_INTERRUPTED, stdout: SUMMARY, stderr: '', saved: 'kept' });
});

test('Ctrl-C ends a program waiting to read a connection', TIMEOUT, async () => {
  const path = scratchFile();
  const source = `"${path}" -> file/open "write" -> stream/write "kept"\n"127.0.0.1" -> socket/listen 0 => listener\nlistener -> socket/port -> io/print-line\nlistener -> socket/accept -> socket/set-timeout nothing => connection\n"reading" -> io/print-line\nconnection -> stream/read-line\n`;
  const program = startProgram([bin], source);
  try {
    const client = await openClient(await listeningPort(program));
    await program.printed('reading\n');
    await pause(200);
    program.child.kill('SIGINT');
    const finished = await program.finished;
    assert.equal(finished.code, EXIT_INTERRUPTED);
    assert.equal(readFileSync(path, 'utf8'), 'kept');
    assert.equal((await client.ended).data, '');
  } finally {
    program.child.kill();
  }
});

test('a second Ctrl-C ends the process even when the program is stuck where the first cannot reach it', { ...TIMEOUT, skip: spawnSync('sh', ['-c', 'command -v mkfifo'], { timeout: 30_000 }).status !== 0 ? 'mkfifo is not available' : false }, async () => {
  const fifo = join(mkdtempSync(join(tmpdir(), 'slopersons-interrupt-')), 'fifo');
  assert.equal(spawnSync('mkfifo', [fifo], { timeout: 30_000 }).status, 0);
  const program = startProgram([bin], `"ready" -> io/print-line\n"${fifo}" -> file/open "read"\n`);
  try {
    await program.printed('ready\n');
    await pause(200);
    program.child.kill('SIGINT');
    await pause(300);
    assert.equal(program.child.exitCode, null, 'opening a FIFO with no writer cannot be interrupted, so the first Ctrl-C leaves it waiting');
    program.child.kill('SIGINT');
    const ended = await new Promise<NodeJS.Signals | null>((resolve) => program.child.on('exit', (_code, signal) => resolve(signal)));
    assert.equal(ended, 'SIGINT');
  } finally {
    program.child.kill('SIGKILL');
  }
});

function interruptRepl(entries: string, readyWhen: string): Promise<{ code: number | null; stdout: string }> {
  return new Promise((resolve) => {
    const child = spawn(bin, ['--repl']);
    let stdout = '';
    let sent = false;
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
      if (!sent && stdout.includes(readyWhen)) {
        sent = true;
        setTimeout(() => child.kill('SIGINT'), 200);
      }
    });
    const timer = setTimeout(() => child.kill('SIGKILL'), 15_000);
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout });
    });
    child.stdin.write(entries);
  });
}

test('Ctrl-C in the REPL ends the session with 130 while an entry runs', TIMEOUT, async () => {
  const result = await interruptRepl('"ready" -> io/print-line\nwhile yes | 1 => x\n', 'ready\n');
  assert.deepEqual(result, { code: EXIT_INTERRUPTED, stdout: `${BANNER}${PROMPT}ready\n-> "ready"\n${PROMPT}` });
});

test('Ctrl-C in the REPL at the prompt still prints the test summary', TIMEOUT, async () => {
  const result = await interruptRepl('"passes" -> test/it | 1 -> test/assert 1\n"ready" -> io/print-line\n', `-> "ready"\n${PROMPT}`);
  assert.equal(result.code, EXIT_INTERRUPTED);
  assert.match(result.stdout, /\n1 passed, 0 failed\n$/);
});

test('Ctrl-C in the REPL ends the session with 130 at the prompt', TIMEOUT, async () => {
  const result = await interruptRepl('"ready" -> io/print-line\n', `-> "ready"\n${PROMPT}`);
  assert.deepEqual(result, { code: EXIT_INTERRUPTED, stdout: `${BANNER}${PROMPT}ready\n-> "ready"\n${PROMPT}\n` });
});
