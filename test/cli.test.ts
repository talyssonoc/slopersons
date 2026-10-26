import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { EXIT_INTERNAL, EXIT_PROGRAM_ERROR, closeOpenStreams } from '../src/boundary.ts';
import { createInterpreter, runProgram } from '../src/cli.ts';
import { ChannelStream, IoFailure, type ByteChannel } from '../src/runtime/stream.ts';
import { fakeIo, runCli } from './helpers/run.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const bin = join(root, 'bin/slopersons.mjs');

function writeTemp(name: string, source: string): string {
  const directory = mkdtempSync(join(tmpdir(), 'slopersons-'));
  const path = join(directory, name);
  writeFileSync(path, source);
  return path;
}

test('bin prints its version when run directly through the shebang', () => {
  const result = spawnSync(bin, ['--version'], { encoding: 'utf8', timeout: 30_000 });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /^slopersons \d+\.\d+\.\d+\n$/);
});

test('bin exits with usage when no file is given', () => {
  const result = spawnSync(bin, [], { encoding: 'utf8', timeout: 30_000 });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /usage/);
});

test('bin reports an unreadable file as a usage error', () => {
  const result = spawnSync(bin, ['/nonexistent/x.slop'], { encoding: 'utf8', timeout: 30_000 });
  assert.equal(result.status, 2);
  assert.equal(result.stderr, 'error: cannot read file /nonexistent/x.slop\n');
});

test('bin runs a program and prints its output', () => {
  const path = writeTemp('hello.slop', '"hello" -> io/print-line\n1 -> int/up-to 3 -> array/each n | n * n -> io/print-line\n');
  const result = spawnSync(bin, [path], { encoding: 'utf8', timeout: 30_000 });
  assert.equal(result.stderr, '');
  assert.equal(result.stdout, 'hello\n1\n4\n9\n');
  assert.equal(result.status, 0);
});

test('bin reports program errors on stderr with file, line and column, exit 1, and no JS trace', () => {
  const path = writeTemp('bad.slop', '"ok" -> io/print-line\n1 => x\nx -> unknown-proc\n');
  const result = spawnSync(bin, [path], { encoding: 'utf8', timeout: 30_000 });
  assert.equal(result.stdout, 'ok\n');
  assert.equal(result.stderr, `error: unknown name \`unknown-proc\`\n  at ${path}:3:6\n`);
  assert.equal(result.status, 1);
});

test('bin reports parse errors the same way', () => {
  const path = writeTemp('parse.slop', 'x -1\n');
  const result = spawnSync(bin, [path], { encoding: 'utf8', timeout: 30_000 });
  assert.match(result.stderr, /^error: unexpected `-`; binary operators need spaces on both sides\n  at .*parse\.slop:1:3\n$/);
  assert.equal(result.status, 1);
});

test('exit sets the process exit code without losing output', () => {
  const path = writeTemp('exit.slop', '"before" -> io/print-line\n3 -> exit\n"after" -> io/print-line\n');
  const result = spawnSync(bin, [path], { encoding: 'utf8', timeout: 30_000 });
  assert.equal(result.stdout, 'before\n');
  assert.equal(result.status, 3);
});

test('read-line reads stdin one line at a time and gives nothing at the end', () => {
  const path = writeTemp('input.slop', 'io/read-line -> do => a\nio/read-line -> do => b\nio/read-line -> do => c\n"{a}|{b}|{c}" -> io/print-line\n');
  const result = spawnSync(bin, [path], { encoding: 'utf8', timeout: 30_000, input: 'first\nsecond\n' });
  assert.equal(result.stdout, 'first|second|nothing\n');
});

test('everything after the program file goes to the program, including words that look like interpreter options', () => {
  const path = writeTemp('arguments.slop', 'io/arguments -> do -> io/print-line\n');
  const result = spawnSync(bin, [path, '--version', '--help', '-h', '--repl', 'café'], { encoding: 'utf8', timeout: 30_000 });
  assert.equal(result.stderr, '');
  assert.equal(result.stdout, '["--version" "--help" "-h" "--repl" "café"]\n');
  assert.equal(result.status, 0);
});

test('an unknown option before the program file is a usage error', () => {
  const path = writeTemp('ignored.slop', '"never" -> io/print-line\n');
  const result = spawnSync(bin, ['--bogus', path], { encoding: 'utf8', timeout: 30_000 });
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /^error: unknown option --bogus\nusage: slopersons <file\.slop> \[arguments\.\.\.\]\n/);
  assert.equal(result.status, 2);
});

test('--repl takes no file or arguments', () => {
  const result = spawnSync(bin, ['--repl', 'program.slop'], { encoding: 'utf8', timeout: 30_000, input: '' });
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /^error: --repl takes no file or arguments\nusage: /);
  assert.equal(result.status, 2);
});

test('read-line decodes characters that take several bytes in UTF-8', () => {
  const path = writeTemp('accents.slop', 'io/read-line -> do => a\nio/read-line -> do => b\n"{a}|{a -> string/length}|{b}|{b -> string/length}" -> io/print-line\n');
  const result = spawnSync(bin, [path], { encoding: 'utf8', timeout: 30_000, input: 'café ü\r\n日本 🎉' });
  assert.equal(result.stdout, 'café ü|6|日本 🎉|4\n');
});

test('standard input read whole keeps its bytes exactly, with no line break added', () => {
  const path = writeTemp('all.slop', 'io/read-line -> do -> io/print-line\nio/stdin -> stream/read-all -> show -> io/print-line\n');
  const result = spawnSync(bin, [path], { encoding: 'utf8', timeout: 30_000, input: 'first\r\nsecond\r\nno break' });
  assert.equal(result.stderr, '');
  assert.equal(result.stdout, 'first\n"second\\r\\nno break"\n');
});

test('invalid UTF-8 on standard input is a program error that names the offset of the bad byte', () => {
  const path = writeTemp('bad-input.slop', 'io/read-line -> do -> io/print-line\nio/read-line -> do -> io/print-line\n');
  const result = spawnSync(bin, [path], { encoding: 'utf8', timeout: 30_000, input: Buffer.from([0x6f, 0x6b, 0x0a, 0xff, 0x0a]) });
  assert.equal(result.stdout, 'ok\n');
  assert.equal(result.stderr, `error: cannot read standard input: it is not valid UTF-8 text (invalid byte at offset 3)\n  at ${path}:2:14\n`);
  assert.equal(result.status, 1);
});

test('file streams a program leaves open are written when it exits or fails', () => {
  const directory = mkdtempSync(join(tmpdir(), 'slopersons-'));
  const exiting = writeTemp('exiting.slop', '"out.txt" -> file/open "write" -> stream/write "on exit"\n4 -> exit\n');
  assert.equal(spawnSync(bin, [exiting], { encoding: 'utf8', timeout: 30_000, cwd: directory }).status, 4);
  assert.equal(readFileSync(join(directory, 'out.txt'), 'utf8'), 'on exit');
  const failing = writeTemp('failing.slop', '"err.txt" -> file/open "write" -> stream/write "on error"\n1 / 0\n');
  assert.equal(spawnSync(bin, [failing], { encoding: 'utf8', timeout: 30_000, cwd: directory }).status, 1);
  assert.equal(readFileSync(join(directory, 'err.txt'), 'utf8'), 'on error');
});

test('relative paths are resolved against the working directory, not the program file', () => {
  const directory = mkdtempSync(join(tmpdir(), 'slopersons-'));
  writeFileSync(join(directory, 'data.txt'), 'from the working directory');
  const path = writeTemp('reader.slop', '"data.txt" -> file/read -> io/print-line\n');
  const result = spawnSync(bin, [path], { encoding: 'utf8', timeout: 30_000, cwd: directory });
  assert.equal(result.stderr, '');
  assert.equal(result.stdout, 'from the working directory\n');
});

test('a failure while writing open streams at the end is reported, and turns a success into exit 1', () => {
  const full: ByteChannel = {
    positioned: false,
    read: () => 0,
    write: () => {
      throw new IoFailure('cannot write "full.txt": no space left on the device');
    },
    close: () => {},
  };
  const io = fakeIo();
  const interpreter = createInterpreter(io);
  const open = (): void => new ChannelStream({ label: 'full.txt', description: '"full.txt"', mode: 'write', channel: full, standard: false, registry: interpreter.streams }).write('pending');
  open();
  assert.equal(closeOpenStreams(interpreter, io, 0), EXIT_PROGRAM_ERROR);
  assert.equal(io.error, 'error: cannot write "full.txt": no space left on the device\n');
  open();
  assert.equal(closeOpenStreams(interpreter, io, 3), 3);
  assert.equal(closeOpenStreams(interpreter, io, 0), 0);
});

test('the binary runs programs on a large stack, so recursion thousands deep works', () => {
  const path = writeTemp('deep.slop', 'proc count n | n = 0 ? 0 : ((n - 1) -> count) + 1\n5000 -> count -> io/print-line\n');
  const result = spawnSync(bin, [path], { encoding: 'utf8', timeout: 30_000 });
  assert.equal(result.stderr, '');
  assert.equal(result.stdout, '5000\n');
});

test('runaway recursion hits the call depth limit as a slopersons error, never a JS stack trace', () => {
  const path = writeTemp('forever.slop', 'proc forever n | (n + 1) -> forever\n0 -> forever\n');
  const result = spawnSync(bin, [path], { encoding: 'utf8', timeout: 30_000 });
  assert.equal(result.stderr, `error: too many nested procedure calls (the limit is 10000)\n  at ${path}:1:26\n`);
  assert.equal(result.status, 1);
});

test('large outputs are flushed completely before the process exits', () => {
  const path = writeTemp('many.slop', '1 -> int/up-to 20000 -> array/each n | n -> io/print-line\n');
  const result = spawnSync(bin, [path], { encoding: 'utf8', timeout: 30_000, maxBuffer: 10_000_000 });
  assert.equal(result.stdout.split('\n').length, 20001);
  assert.equal(result.stdout.endsWith('20000\n'), true);
});

test('a value that exceeds what the interpreter can hold is a program error, not a crash', () => {
  const path = writeTemp('huge.slop', '"x" => s\nwhile yes\n| s + s => s\n');
  const result = spawnSync(bin, [path], { encoding: 'utf8', timeout: 30_000 });
  assert.equal(result.stderr, 'error: a value grew too large for the interpreter to hold\n');
  assert.equal(result.status, 1);
});

test('running out of memory is reported as a program error with no V8 output', () => {
  const path = writeTemp('oom.slop', '[] => keep\nwhile yes\n| 1 -> int/up-to 200000 => chunk\n| [keep chunk] => keep\n');
  const result = spawnSync(bin, [path], { encoding: 'utf8', env: { ...process.env, SLOPERSONS_MAX_HEAP_MB: '48' }, timeout: 60_000 });
  assert.equal(result.stderr, 'error: the program ran out of memory (the limit is 48 MB)\n');
  assert.equal(result.status, 1);
});

test('the package script runs a program and passes the exit code through', () => {
  const path = writeTemp('script.slop', '"via script" -> io/print-line\n7 -> exit\n');
  const result = spawnSync('pnpm', ['--silent', 'slopersons', path], { encoding: 'utf8', timeout: 30_000, cwd: root });
  assert.equal(result.stdout, 'via script\n');
  assert.equal(result.status, 7);
});

test('a reader that closes the pipe early ends the program quietly, with no JS trace', async () => {
  const path = writeTemp('pipe.slop', '1 -> int/up-to 200000 -> array/each n | n -> io/print-line\n');
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

test('a prompt written with print reaches the reader before the program blocks on read-line', async () => {
  const path = writeTemp('prompt.slop', '"Welcome" -> io/print-line\n"Name: " -> io/print\nio/read-line -> do => name\n"Age: " -> io/print\nio/read-line -> do => age\n"hello {name}, {age}" -> io/print-line\n');
  const child = spawn(bin, [path], { stdio: ['pipe', 'pipe', 'pipe'] });
  let stdout = '';
  child.stdout.setEncoding('utf8');
  const waitFor = (expected: string): Promise<void> =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        child.kill();
        reject(new Error(`timed out waiting for ${JSON.stringify(expected)}, got ${JSON.stringify(stdout)}`));
      }, 5000);
      const check = (): void => {
        if (stdout === expected) {
          clearTimeout(timer);
          child.stdout.off('data', check);
          resolve();
        }
      };
      child.stdout.on('data', check);
      check();
    });
  child.stdout.on('data', (chunk: string) => {
    stdout += chunk;
  });
  await waitFor('Welcome\nName: ');
  child.stdin.write('Ada\n');
  await waitFor('Welcome\nName: Age: ');
  child.stdin.write('36\n');
  child.stdin.end();
  const code = await new Promise<number | null>((resolve) => child.on('close', resolve));
  assert.equal(stdout, 'Welcome\nName: Age: hello Ada, 36\n');
  assert.equal(code, 0);
});

test('the call depth limit is an ordinary error that attempt can recover from', () => {
  const path = writeTemp('deep-recover.slop', 'proc forever n | (n + 1) -> forever\nattempt | 0 -> forever recover e | e -> io/print-line\n');
  const result = spawnSync(bin, [path], { encoding: 'utf8', timeout: 30_000 });
  assert.equal(result.stderr, '');
  assert.equal(result.stdout, 'too many nested procedure calls (the limit is 10000)\n');
  assert.equal(result.status, 0);
});

test('a value that outgrows the interpreter is not catchable by attempt', () => {
  const path = writeTemp('huge-recover.slop', 'attempt\n| "x" => s\n| while yes\n| | s + s => s\nrecover\n| "caught" -> io/print-line\n');
  const result = spawnSync(bin, [path], { encoding: 'utf8', timeout: 30_000 });
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, 'error: a value grew too large for the interpreter to hold\n');
  assert.equal(result.status, 1);
});

test('--repl runs an interactive session through the binary', () => {
  const result = spawnSync(bin, ['--repl'], { encoding: 'utf8', timeout: 30_000, input: '5 + 3\n"x" -> io/print-line\n' });
  assert.equal(result.stdout, 'slopersons, Ctrl-D to leave\n> -> 8\n> x\n-> "x"\n> \n');
  assert.equal(result.stderr, '');
  assert.equal(result.status, 0);
});

test('a program sees the environment it was started with and secure random values', () => {
  const path = writeTemp('environment.slop', 'io/environment -> do -> hashmap/at "SLOPERSONS_TEST_GREETING" -> io/print-line\n16 -> string/random-hex -> io/print-line\n16 -> string/random-hex -> io/print-line\n');
  const result = spawnSync(bin, [path], { encoding: 'utf8', timeout: 30_000, env: { ...process.env, SLOPERSONS_TEST_GREETING: 'olá, mundo' } });
  assert.equal(result.stderr, '');
  const [greeting, first, second] = result.stdout.split('\n');
  assert.equal(greeting, 'olá, mundo');
  assert.match(first ?? '', /^[0-9a-f]{16}$/);
  assert.notEqual(first, second);
  assert.equal(result.status, 0);
});

test('a REPL session sees the environment and random values too', () => {
  const result = spawnSync(bin, ['--repl'], { encoding: 'utf8', timeout: 30_000, env: { ...process.env, SLOPERSONS_TEST_GREETING: 'hi' }, input: 'io/environment -> do -> hashmap/at "SLOPERSONS_TEST_GREETING"\n4 -> string/random-hex -> string/length\n' });
  assert.equal(result.stdout, 'slopersons, Ctrl-D to leave\n> -> "hi"\n> -> 4\n> \n');
  assert.equal(result.stderr, '');
  assert.equal(result.status, 0);
});

test('read-line inside a REPL entry reads the next input line through the same channel', () => {
  const result = spawnSync(bin, ['--repl'], { encoding: 'utf8', timeout: 30_000, input: 'io/read-line -> do -> string/upper\nhello\n' });
  assert.equal(result.stdout, 'slopersons, Ctrl-D to leave\n> -> "HELLO"\n> \n');
  assert.equal(result.status, 0);
});

test('in the REPL, use resolves relative to the working directory', () => {
  const dir = mkdtempSync(join(tmpdir(), 'slopersons-repl-modules-'));
  writeFileSync(join(dir, 'geometry.slop'), 'proc area r | 3 * r * r\nexport area\n');
  const result = spawnSync(bin, ['--repl'], { encoding: 'utf8', timeout: 30_000, cwd: dir, input: '"./geometry" -> use => geo\n5 -> geo/area\n' });
  assert.equal(result.stdout, 'slopersons, Ctrl-D to leave\n> -> <module geometry>\n> -> 75\n> \n');
  assert.equal(result.status, 0);
});

test('--help mentions the REPL', () => {
  const result = spawnSync(bin, ['--help'], { encoding: 'utf8', timeout: 30_000 });
  assert.match(result.stdout, /slopersons --repl/);
});

test('runProgram maps program errors to exit 1 and prints them in slopersons terms', () => {
  const { code, io } = runCli('1 / 0');
  assert.equal(code, EXIT_PROGRAM_ERROR);
  assert.equal(io.error, 'error: division by zero\n  at test.slop:1:3\n');
});

test('an interpreter bug is reported without any JavaScript stack or message', () => {
  const io = fakeIo();
  const interpreter = createInterpreter(io);
  interpreter.defineBuiltin('boom', 1, () => {
    throw new TypeError("Cannot read properties of undefined (reading 'x')");
  });
  const code = runProgram('1 -> boom', 'test.slop', io, interpreter);
  assert.equal(code, EXIT_INTERNAL);
  assert.equal(io.error, 'error: internal interpreter error; this is a bug in slopersons, not in your program\n');
  assert.doesNotMatch(io.error, /TypeError|undefined|\n\s+at /);
});

test('a JS stack overflow is reported as a slopersons error', () => {
  const io = fakeIo();
  const interpreter = createInterpreter(io);
  interpreter.defineBuiltin('overflow', 1, () => {
    throw new RangeError('Maximum call stack size exceeded');
  });
  const code = runProgram('1 -> overflow', 'test.slop', io, interpreter);
  assert.equal(code, EXIT_PROGRAM_ERROR);
  assert.equal(io.error, 'error: the program recursed too deeply for the interpreter to continue\n');
});
