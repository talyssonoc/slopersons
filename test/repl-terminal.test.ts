import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const bin = join(root, 'bin/slopersons.mjs');
const hasScript = spawnSync('sh', ['-c', 'command -v script'], { encoding: 'utf8', timeout: 30_000 }).status === 0;
const supported = (process.platform === 'darwin' || process.platform === 'linux') && hasScript;

interface TerminalSession {
  child: ChildProcess;
  transcript: () => string;
  send: (keys: string) => Promise<void>;
  waitFor: (needle: string) => Promise<void>;
  end: () => Promise<number | null>;
}

function stripEscapes(text: string): string {
  return text.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').replace(/\r/g, '');
}

const sessions: ChildProcess[] = [];

// Killing only the sh that starts a session would leave cat, script and the REPL running, so each session is its own process group.
function killGroup(child: ChildProcess): void {
  if (child.pid === undefined || child.exitCode !== null) return;
  try {
    process.kill(-child.pid, 'SIGKILL');
  } catch {
    // the group has already ended
  }
}

after(() => {
  for (const child of sessions) killGroup(child);
});

// macOS implements FIFOs and Node's stdio pipes as sockets, which script rejects with
// "Operation not supported on socket"; relaying the keystrokes through cat gives script a real pipe.
function openTerminalSession(): TerminalSession {
  const directory = mkdtempSync(join(tmpdir(), 'slopersons-terminal-'));
  const log = join(directory, 'typescript.txt');
  const errorLog = join(directory, 'stderr.txt');
  const command =
    process.platform === 'darwin'
      ? 'cat | script -q -t 0 "$0" "$1" --repl > /dev/null 2> "$2"'
      : 'cat | script -qefc "$1 --repl" "$0" > /dev/null 2> "$2"';
  const child = spawn('sh', ['-c', command, log, bin, errorLog], { stdio: ['pipe', 'ignore', 'ignore'], detached: true });
  sessions.push(child);
  const transcript = (): string => stripEscapes(existsSync(log) ? readFileSync(log, 'utf8') : '');
  return {
    child,
    transcript,
    send: (keys) =>
      new Promise((resolve) => {
        setTimeout(() => {
          child.stdin?.write(keys);
          resolve();
        }, 120);
      }),
    waitFor: (needle) =>
      new Promise((resolve, reject) => {
        const started = Date.now();
        const timer = setInterval(() => {
          if (transcript().includes(needle)) {
            clearInterval(timer);
            resolve();
          } else if (Date.now() - started > 10_000) {
            clearInterval(timer);
            killGroup(child);
            const stderr = existsSync(errorLog) ? readFileSync(errorLog, 'utf8') : '';
            reject(new Error(`timed out waiting for ${JSON.stringify(needle)}; transcript so far: ${JSON.stringify(transcript())}; stderr: ${stderr}`));
          }
        }, 50);
      }),
    end: () =>
      new Promise((resolve) => {
        const timer = setTimeout(() => {
          killGroup(child);
          resolve(null);
        }, 10_000);
        child.on('close', (code) => {
          clearTimeout(timer);
          resolve(code);
        });
        child.stdin?.end();
      }),
  };
}

const LEFT = '\x1b[D';
const UP = '\x1b[A';
const CTRL_D = '\x04';
const CTRL_C = '\x03';

test('in a real terminal the REPL supports line editing, history, block entries and end of input', { skip: supported ? false : 'needs the script command on macOS or Linux', timeout: 60_000 }, async () => {
  const session = openTerminalSession();
  await session.waitFor('> ');

  await session.send('12');
  await session.send(LEFT);
  await session.send('0');
  await session.send('\r');
  await session.waitFor('-> 102');

  await session.send(UP);
  await session.send('\r');
  await session.waitFor('> ');
  const echoesAfterRecall = (): number => (session.transcript().match(/-> 102\n/g) ?? []).length;
  const started = Date.now();
  while (echoesAfterRecall() < 2 && Date.now() - started < 10_000) await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(echoesAfterRecall(), 2, `history recall should re-run the edited entry; transcript: ${JSON.stringify(session.transcript())}`);

  await session.send('proc double n\r');
  await session.waitFor('.. ');
  await session.send('| n * 2\r');
  await session.send('\r');
  await session.send('21 -> double\r');
  await session.waitFor('-> 42');

  await session.send(CTRL_D);
  const code = await session.end();
  assert.equal(code, 0);
  assert.doesNotMatch(session.transcript(), /error:/);
});

test('in a real terminal Ctrl-C stops a running entry and returns to the prompt', { skip: supported ? false : 'needs the script command on macOS or Linux', timeout: 60_000 }, async () => {
  const session = openTerminalSession();
  await session.waitFor('> ');
  await session.send('while yes | 1 => x\r');
  await new Promise((resolve) => setTimeout(resolve, 300));
  await session.send(CTRL_C);
  await session.waitFor('interrupted');
  await session.send('1 + 1\r');
  await session.waitFor('-> 2');
  await session.send(CTRL_D);
  assert.equal(await session.end(), 0);
});

test('in a real terminal Ctrl-C at the prompt throws away what was typed', { skip: supported ? false : 'needs the script command on macOS or Linux', timeout: 60_000 }, async () => {
  const session = openTerminalSession();
  await session.waitFor('> ');
  await session.send('oops');
  await session.send(CTRL_C);
  await session.send('2 + 2\r');
  await session.waitFor('-> 4');
  await session.send(CTRL_D);
  assert.equal(await session.end(), 0);
  assert.doesNotMatch(session.transcript(), /error:/);
});
