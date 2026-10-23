import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { EXIT_INTERNAL, EXIT_PROGRAM_ERROR, createInterpreter, runProgram } from '../src/cli.ts';
import { fakeIo, runCli } from './helpers/run.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const bin = join(root, 'bin/slopersons.mjs');

function writeTemp(name: string, source: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'slopersons-'));
  const path = join(dir, name);
  writeFileSync(path, source);
  return path;
}

test('bin prints its version when run directly through the shebang', () => {
  const result = spawnSync(bin, ['--version'], { encoding: 'utf8' });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /^slopersons \d+\.\d+\.\d+\n$/);
});

test('bin exits with usage when no file is given', () => {
  const result = spawnSync(bin, [], { encoding: 'utf8' });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /usage/);
});

test('bin reports an unreadable file as a usage error', () => {
  const result = spawnSync(bin, ['/nonexistent/x.slop'], { encoding: 'utf8' });
  assert.equal(result.status, 2);
  assert.equal(result.stderr, 'error: cannot read file /nonexistent/x.slop\n');
});

test('bin runs a program and prints its output', () => {
  const path = writeTemp('hello.slop', '"hello" -> print\n1 -> to 3 -> each n | n * n -> print\n');
  const result = spawnSync(bin, [path], { encoding: 'utf8' });
  assert.equal(result.stderr, '');
  assert.equal(result.stdout, 'hello\n1\n4\n9\n');
  assert.equal(result.status, 0);
});

test('bin reports program errors on stderr with file, line and column, exit 1, and no JS trace', () => {
  const path = writeTemp('bad.slop', '"ok" -> print\n1 => x\nx -> unknown-proc\n');
  const result = spawnSync(bin, [path], { encoding: 'utf8' });
  assert.equal(result.stdout, 'ok\n');
  assert.equal(result.stderr, `error: unknown name \`unknown-proc\`\n  at ${path}:3:6\n`);
  assert.equal(result.status, 1);
});

test('bin reports parse errors the same way', () => {
  const path = writeTemp('parse.slop', 'x -1\n');
  const result = spawnSync(bin, [path], { encoding: 'utf8' });
  assert.match(result.stderr, /^error: unexpected `-`; binary operators need spaces on both sides\n  at .*parse\.slop:1:3\n$/);
  assert.equal(result.status, 1);
});

test('exit sets the process exit code without losing output', () => {
  const path = writeTemp('exit.slop', '"before" -> print\n3 -> exit\n"after" -> print\n');
  const result = spawnSync(bin, [path], { encoding: 'utf8' });
  assert.equal(result.stdout, 'before\n');
  assert.equal(result.status, 3);
});

test('read-line reads stdin one line at a time and gives nothing at the end', () => {
  const path = writeTemp('input.slop', 'read-line -> do => a\nread-line -> do => b\nread-line -> do => c\n"{a}|{b}|{c}" -> print\n');
  const result = spawnSync(bin, [path], { encoding: 'utf8', input: 'first\nsecond\n' });
  assert.equal(result.stdout, 'first|second|nothing\n');
});

test('the binary runs programs on a large stack, so recursion thousands deep works', () => {
  const path = writeTemp('deep.slop', 'proc count n | n = 0 ? 0 : ((n - 1) -> count) + 1\n5000 -> count -> print\n');
  const result = spawnSync(bin, [path], { encoding: 'utf8' });
  assert.equal(result.stderr, '');
  assert.equal(result.stdout, '5000\n');
});

test('runaway recursion hits the call depth limit as a slopersons error, never a JS stack trace', () => {
  const path = writeTemp('forever.slop', 'proc forever n | (n + 1) -> forever\n0 -> forever\n');
  const result = spawnSync(bin, [path], { encoding: 'utf8' });
  assert.equal(result.stderr, `error: too many nested procedure calls (the limit is 10000)\n  at ${path}:1:26\n`);
  assert.equal(result.status, 1);
});

test('large outputs are flushed completely before the process exits', () => {
  const path = writeTemp('many.slop', '1 -> to 20000 -> each n | n -> print\n');
  const result = spawnSync(bin, [path], { encoding: 'utf8', maxBuffer: 10_000_000 });
  assert.equal(result.stdout.split('\n').length, 20001);
  assert.equal(result.stdout.endsWith('20000\n'), true);
});

test('a value that exceeds what the interpreter can hold is a program error, not a crash', () => {
  const path = writeTemp('huge.slop', '"x" => s\nwhile yes\n| s + s => s\n');
  const result = spawnSync(bin, [path], { encoding: 'utf8' });
  assert.equal(result.stderr, 'error: a value grew too large for the interpreter to hold\n');
  assert.equal(result.status, 1);
});

test('running out of memory is reported as a program error with no V8 output', () => {
  const path = writeTemp('oom.slop', '[] => keep\nwhile yes\n| 1 -> to 200000 => chunk\n| [keep chunk] => keep\n');
  const result = spawnSync(bin, [path], { encoding: 'utf8', env: { ...process.env, SLOPERSONS_MAX_HEAP_MB: '48' }, timeout: 60_000 });
  assert.equal(result.stderr, 'error: the program ran out of memory (the limit is 48 MB)\n');
  assert.equal(result.status, 1);
});

test('the package script runs a program and passes the exit code through', () => {
  const path = writeTemp('script.slop', '"via script" -> print\n7 -> exit\n');
  const result = spawnSync('pnpm', ['--silent', 'slopersons', path], { encoding: 'utf8', cwd: root });
  assert.equal(result.stdout, 'via script\n');
  assert.equal(result.status, 7);
});

test('a reader that closes the pipe early ends the program quietly, with no JS trace', async () => {
  const path = writeTemp('pipe.slop', '1 -> to 200000 -> each n | n -> print\n');
  const child = spawn(bin, [path], { stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk: string) => {
    stderr += chunk;
  });
  child.stdout.once('data', () => child.stdout.destroy());
  const code = await new Promise<number | null>((resolve) => child.on('close', resolve));
  assert.equal(stderr, '');
  assert.equal(code, 0);
});

test('runProgram maps program errors to exit 1 and prints them in slopersons terms', () => {
  const { code, io } = runCli('1 / 0');
  assert.equal(code, EXIT_PROGRAM_ERROR);
  assert.equal(io.err, 'error: division by zero\n  at test.slop:1:3\n');
});

test('an interpreter bug is reported without any JavaScript stack or message', () => {
  const io = fakeIo();
  const interp = createInterpreter(io);
  interp.defineBuiltin('boom', 1, () => {
    throw new TypeError("Cannot read properties of undefined (reading 'x')");
  });
  const code = runProgram('1 -> boom', 'test.slop', io, interp);
  assert.equal(code, EXIT_INTERNAL);
  assert.equal(io.err, 'error: internal interpreter error; this is a bug in slopersons, not in your program\n');
  assert.doesNotMatch(io.err, /TypeError|undefined|\n\s+at /);
});

test('a JS stack overflow is reported as a slopersons error', () => {
  const io = fakeIo();
  const interp = createInterpreter(io);
  interp.defineBuiltin('overflow', 1, () => {
    throw new RangeError('Maximum call stack size exceeded');
  });
  const code = runProgram('1 -> overflow', 'test.slop', io, interp);
  assert.equal(code, EXIT_PROGRAM_ERROR);
  assert.equal(io.err, 'error: the program recursed too deeply for the interpreter to continue\n');
});
