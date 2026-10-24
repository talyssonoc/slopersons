import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { WAITING_CONNECTIONS_LIMIT } from '../src/bridge.ts';
import { BANNER, PROMPT } from '../src/repl.ts';
import { closedPort, listeningPort, openClient, portIsFree, startProgram, startServer, talkToEchoServer, within, type Client } from './helpers/network.ts';

const bin = fileURLToPath(new URL('../bin/slopersons.mjs', import.meta.url));
const command = [bin];
const TIMEOUT = { timeout: 20_000 };

test('a server answers consecutive clients one at a time, in the order they connected', TIMEOUT, async () => {
  const { replies, finished } = await talkToEchoServer(command);
  assert.deepEqual(replies, ['#0 you said: first\n', '#1 you said: second\n', '#2 you said: third\n']);
  assert.equal(finished.stderr, '');
  assert.equal(finished.stdout.split('\n').slice(1).join('\n'), 'served 3\n');
  assert.equal(finished.code, 0);
});

test(`clients wait in a queue of at most ${WAITING_CONNECTIONS_LIMIT} while the program is busy, and the next one is turned away`, TIMEOUT, async () => {
  const source = [
    '"127.0.0.1" -> socket/listen 0 => listener',
    'listener -> socket/port -> io/print-line',
    'io/read-line -> do',
    '0 => served',
    'while served < 10',
    '| listener -> socket/accept => connection',
    '| connection -> stream/write-line "#{served}" -> stream/close',
    '| served + 1 => served',
    '',
  ].join('\n');
  const program = startProgram(command, source);
  try {
    const port = await listeningPort(program);
    const waiting: Client[] = [];
    for (let i = 0; i < WAITING_CONNECTIONS_LIMIT; i++) waiting.push(await openClient(port));
    const turnedAway = await openClient(port);
    assert.equal((await within(turnedAway.ended, 5000, 'the client beyond the limit to be turned away')).data, '');
    assert.deepEqual(
      waiting.map((client) => client.isEnded()),
      waiting.map(() => false),
    );
    program.child.stdin?.write('go\n');
    const replies = await Promise.all(waiting.map(async (client) => (await client.ended).data));
    assert.deepEqual(
      replies,
      waiting.map((_client, index) => `#${index}\n`),
    );
    assert.equal((await program.finished).code, 0);
  } finally {
    program.child.kill();
  }
});

test('a read that waits longer than the connection timeout fails, and the connection can still be read afterwards', TIMEOUT, async () => {
  const source = [
    '"127.0.0.1" -> socket/listen 0 => listener',
    'listener -> socket/port -> io/print-line',
    'listener -> socket/accept -> socket/set-timeout 200 => connection',
    'attempt | connection -> stream/read-line recover problem | problem -> io/print-line',
    'connection -> socket/set-timeout 1000',
    'attempt | connection -> stream/read-line recover problem | problem -> io/print-line',
    '"waiting" -> io/print-line',
    'connection -> socket/set-timeout nothing -> stream/read-line -> io/print-line',
    '',
  ].join('\n');
  const program = startProgram(command, source);
  try {
    const client = await openClient(await listeningPort(program));
    await program.printed('waiting\n');
    client.socket.write('late\n');
    const finished = await program.finished;
    assert.match(
      finished.stdout,
      /^\d+\ncannot read the connection from 127\.0\.0\.1:\d+: nothing arrived within 200 milliseconds\ncannot read the connection from 127\.0\.0\.1:\d+: nothing arrived within 1 second\nwaiting\nlate\n$/,
    );
    assert.equal(finished.code, 0);
  } finally {
    program.child.kill();
  }
});

test('a write the client does not take within the timeout fails and closes the connection', TIMEOUT, async () => {
  const source = [
    '"127.0.0.1" -> socket/listen 0 => listener',
    'listener -> socket/port -> io/print-line',
    'listener -> socket/accept -> socket/set-timeout 300 => connection',
    '"x" -> string/repeat 30000000 => big',
    'attempt | connection -> stream/write big recover problem | problem -> io/print-line',
    'attempt | connection -> stream/write "more" -> stream/flush recover problem | problem -> io/print-line',
    '',
  ].join('\n');
  const program = startProgram(command, source);
  try {
    const client = await openClient(await listeningPort(program));
    client.socket.pause();
    const finished = await program.finished;
    const failure = 'the connection from 127\\.0\\.0\\.1:\\d+: the other side did not take the data within 300 milliseconds';
    assert.match(finished.stdout, new RegExp(`^\\d+\\ncannot write ${failure}\\ncannot write ${failure}\\n$`));
    assert.equal(finished.code, 0);
  } finally {
    program.child.kill();
  }
});

test('reading a counted part of a connection, then the rest once the client stops sending, and answering after that', TIMEOUT, async () => {
  const source = [
    '"127.0.0.1" -> socket/listen 0 => listener',
    'listener -> socket/port -> io/print-line',
    'listener -> socket/accept => connection',
    'connection -> stream/read 6 => head',
    'connection -> stream/read-all => rest',
    'connection -> stream/write-line "head=[{head}] rest=[{rest}]" -> stream/close',
    '',
  ].join('\n');
  const program = startProgram(command, source);
  try {
    const client = await openClient(await listeningPort(program));
    client.socket.end('héllo world\nmore');
    assert.deepEqual(await client.ended, { data: 'head=[héllo] rest=[ world\nmore]\n', error: null });
    assert.equal((await program.finished).code, 0);
  } finally {
    program.child.kill();
  }
});

test('a connection left open is flushed and closed when the program ends, and the program exits', TIMEOUT, async () => {
  const source = '"127.0.0.1" -> socket/listen 0 => listener\nlistener -> socket/port -> io/print-line\nlistener -> socket/accept -> stream/write "bye"\n';
  const program = startProgram(command, source);
  try {
    const client = await openClient(await listeningPort(program));
    assert.deepEqual(await client.ended, { data: 'bye', error: null });
    assert.equal((await program.finished).code, 0);
  } finally {
    program.child.kill();
  }
});

test('a program connects to a server, writes to it and reads its answer', TIMEOUT, async () => {
  const { server, port } = await startServer((socket) => {
    socket.setEncoding('utf8');
    socket.once('data', (line: string) => socket.end(`hello ${line}`));
  });
  try {
    const source = 'io/arguments -> do -> array/at 0 -> string/to-int => port\n"127.0.0.1" -> socket/connect port => connection\nconnection -> stream/write-line "ada" -> stream/read-line -> io/print-line\n';
    const program = startProgram(command, source, [String(port)]);
    const finished = await program.finished;
    assert.deepEqual(finished, { stdout: 'hello ada\n', stderr: '', code: 0 });
  } finally {
    server.close();
  }
});

test('connecting to a port nobody listens on is a program error at the call', TIMEOUT, async () => {
  const port = await closedPort();
  const program = startProgram(command, 'io/arguments -> do -> array/at 0 -> string/to-int => port\n"127.0.0.1" -> socket/connect port\n', [String(port)]);
  const finished = await program.finished;
  assert.deepEqual(finished, { stdout: '', stderr: `error: cannot connect to 127.0.0.1:${port}: the connection was refused\n  at ${program.path}:2:13\n`, code: 1 });
});

test('listening on a port that is already taken is a program error at the call', TIMEOUT, async () => {
  const { server, port } = await startServer(() => {});
  try {
    const program = startProgram(command, `"127.0.0.1" -> socket/listen ${port}\n`);
    const finished = await program.finished;
    assert.deepEqual(finished, { stdout: '', stderr: `error: cannot listen on 127.0.0.1:${port}: the address is already in use\n  at ${program.path}:1:13\n`, code: 1 });
  } finally {
    server.close();
  }
});

test('the REPL can use sockets', () => {
  const result = spawnSync(bin, ['--repl'], { encoding: 'utf8', timeout: 30_000, input: '"127.0.0.1" -> socket/listen 0 -> socket/port -> type-of\n' });
  assert.equal(result.stderr, '');
  assert.equal(result.stdout, `${BANNER}${PROMPT}-> "int"\n${PROMPT}\n`);
  assert.equal(result.status, 0);
});

const ENDINGS = [
  { name: 'finishing', ending: '', stop: 'input', code: 0, stderr: /^$/ },
  { name: 'failing with a runtime error', ending: '1 / 0\n', stop: 'input', code: 1, stderr: /^error: division by zero/ },
  { name: 'calling exit', ending: '3 -> exit\n', stop: 'input', code: 3, stderr: /^$/ },
  { name: 'being stopped with Ctrl-C', ending: '', stop: 'ctrl-c', code: 130, stderr: /^$/ },
] as const;

for (const { name, ending, stop, code, stderr } of ENDINGS) {
  test(`a program ${name} frees its port at once, sends what it wrote, disconnects every client and exits`, TIMEOUT, async () => {
    const source = [
      '"127.0.0.1" -> socket/listen 0 => listener',
      'listener -> socket/port -> io/print-line',
      'listener -> socket/accept => connection',
      'connection -> socket/set-timeout nothing -> stream/write "partial"',
      '"accepted" -> io/print-line',
      'io/read-line -> do',
      ending,
    ].join('\n');
    const program = startProgram(command, source);
    try {
      const port = await listeningPort(program);
      const accepted = await openClient(port);
      await program.printed('accepted\n');
      const waiting = await openClient(port);
      await new Promise((resolve) => setTimeout(resolve, 200));
      if (stop === 'ctrl-c') program.child.kill('SIGINT');
      else program.child.stdin?.write('go\n');
      const finished = await within(program.finished, 10_000, 'the program to exit');
      assert.equal(finished.code, code);
      assert.match(finished.stderr, stderr);
      assert.equal((await within(accepted.ended, 5000, 'the accepted client to be disconnected')).data, 'partial');
      assert.equal((await within(waiting.ended, 5000, 'the waiting client to be disconnected')).data, '');
      assert.equal(await portIsFree(port), true);
    } finally {
      program.child.kill();
    }
  });
}
