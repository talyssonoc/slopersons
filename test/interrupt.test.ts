import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterpreter, runProgram } from '../src/cli.ts';
import { EXIT_INTERRUPTED, type Interruption } from '../src/interpreter.ts';
import { BANNER, CONTINUATION_PROMPT, PROMPT } from '../src/repl.ts';
import { listeningPort, openClient, startProgram, within } from './helpers/network.ts';
import { fakeIo } from './helpers/run.ts';

const bin = fileURLToPath(new URL('../bin/slopersons.mjs', import.meta.url));
const TIMEOUT = { timeout: 20_000 };

function pause(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function interruptAfter(checks: number): Interruption {
  let count = 0;
  return { take: () => ++count === checks, clear: () => {} };
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

interface ReplSession {
  send: (entries: string) => void;
  pressCtrlC: () => void;
  waitFor: (stream: 'stdout' | 'stderr', needle: string, count?: number) => Promise<void>;
  end: () => Promise<{ code: number | null; stdout: string; stderr: string }>;
}

const replSessions: ChildProcess[] = [];

after(() => {
  for (const child of replSessions) child.kill('SIGKILL');
});

function startRepl(): ReplSession {
  const child = spawn(bin, ['--repl']);
  replSessions.push(child);
  const output = { stdout: '', stderr: '' };
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => {
    output.stdout += chunk;
  });
  child.stderr.on('data', (chunk: string) => {
    output.stderr += chunk;
  });
  const closed = new Promise<number | null>((resolve) => child.on('close', resolve));
  const occurrences = (haystack: string, needle: string): number => haystack.split(needle).length - 1;
  return {
    send: (entries) => {
      child.stdin.write(entries);
    },
    pressCtrlC: () => {
      child.kill('SIGINT');
    },
    waitFor: (stream, needle, count = 1) =>
      within(
        new Promise<void>((resolve) => {
          const check = (): void => {
            if (occurrences(output[stream], needle) >= count) resolve();
            else setTimeout(check, 20);
          };
          check();
        }),
        10_000,
        `${JSON.stringify(needle)} on ${stream}`,
      ),
    end: async () => {
      child.stdin.end();
      const code = await within(closed, 10_000, 'the REPL to leave');
      return { code, ...output };
    },
  };
}

test('Ctrl-C in the REPL stops the running entry and returns to the prompt', TIMEOUT, async () => {
  const session = startRepl();
  session.send('"ready" -> io/print-line\nwhile yes | 1 => x\n');
  await session.waitFor('stdout', 'ready\n');
  await pause(200);
  session.pressCtrlC();
  await session.waitFor('stderr', 'interrupted\n');
  session.send('1 + 1\n');
  await session.waitFor('stdout', '-> 2\n');
  const result = await session.end();
  assert.equal(result.code, 0);
  assert.equal(result.stderr, 'interrupted\n');
});

test('Ctrl-C at the REPL prompt drops the entry being collected and shows a new prompt', TIMEOUT, async () => {
  const session = startRepl();
  session.send('proc double n\n');
  await session.waitFor('stdout', CONTINUATION_PROMPT);
  session.pressCtrlC();
  await session.waitFor('stdout', `${CONTINUATION_PROMPT}\n${PROMPT}`);
  session.send('21 * 2\n');
  await session.waitFor('stdout', '-> 42\n');
  const result = await session.end();
  assert.deepEqual({ code: result.code, stderr: result.stderr }, { code: 0, stderr: '' });
  assert.equal(result.stdout, `${BANNER}${PROMPT}${CONTINUATION_PROMPT}\n${PROMPT}-> 42\n${PROMPT}\n`);
});

test('every Ctrl-C in a REPL session counts as a first one, so the session survives several', TIMEOUT, async () => {
  const session = startRepl();
  for (let round = 1; round <= 3; round++) {
    session.send(`"round ${round}" -> io/print-line\nwhile yes | 1 => x\n`);
    await session.waitFor('stdout', `round ${round}\n`);
    await pause(200);
    session.pressCtrlC();
    await session.waitFor('stderr', 'interrupted\n', round);
  }
  for (let press = 1; press <= 2; press++) {
    session.pressCtrlC();
    await pause(200);
  }
  session.send('"still here" -> io/print-line\n');
  await session.waitFor('stdout', 'still here\n');
  assert.equal((await session.end()).code, 0);
});

test('after a Ctrl-C in the REPL, the test summary still appears when the session ends', TIMEOUT, async () => {
  const session = startRepl();
  session.send('"passes" -> test/it | 1 -> test/assert 1\n');
  await session.waitFor('stdout', '✓ passes\n');
  session.pressCtrlC();
  await pause(200);
  const result = await session.end();
  assert.equal(result.code, 0);
  assert.match(result.stdout, /\n1 passed, 0 failed\n$/);
});
