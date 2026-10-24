import { test } from 'node:test';
import assert from 'node:assert/strict';
import { connect, type Socket } from 'node:net';
import { PassThrough, type Readable } from 'node:stream';
import { MessageChannel } from 'node:worker_threads';
import { INTERRUPT_HANDLED, INTERRUPT_REQUESTED, hostBridge } from '../src/bridge.ts';
import { portIsFree, within } from './helpers/network.ts';

type Reply = Record<string, unknown>;

const TIMEOUT = { timeout: 10_000 };

function pause(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function text(reply: Reply): string {
  const bytes = reply['bytes'];
  assert.ok(bytes instanceof Uint8Array, `expected bytes, got ${JSON.stringify(reply)}`);
  return Buffer.from(bytes).toString('utf8');
}

function startHost(openInput: () => Readable = () => new PassThrough()) {
  const { port1, port2 } = new MessageChannel();
  const shared = { signal: new SharedArrayBuffer(4), interrupt: new SharedArrayBuffer(4) };
  const host = hostBridge({ messages: port1, ...shared }, openInput);
  const unread: Reply[] = [];
  const waiting: ((reply: Reply) => void)[] = [];
  port2.on('message', (reply: Reply) => {
    const waiter = waiting.shift();
    if (waiter === undefined) unread.push(reply);
    else waiter(reply);
  });
  const next = (): Promise<Reply> =>
    within(
      new Promise((resolve) => {
        const reply = unread.shift();
        if (reply === undefined) waiting.push(resolve);
        else resolve(reply);
      }),
      5000,
      'a reply from the main thread',
    );
  const interrupt = new Int32Array(shared.interrupt);
  return {
    host,
    next,
    post: (request: Reply): void => port2.postMessage(request),
    send: (request: Reply): Promise<Reply> => {
      port2.postMessage(request);
      return next();
    },
    unread: (): number => unread.length,
    pressCtrlC: (): void => {
      Atomics.store(interrupt, 0, INTERRUPT_REQUESTED);
      host.interrupt();
    },
    requested: (): void => {
      Atomics.store(interrupt, 0, INTERRUPT_REQUESTED);
    },
    handled: (): void => {
      Atomics.store(interrupt, 0, INTERRUPT_HANDLED);
    },
    close: (): void => {
      host.close();
      port2.close();
    },
  };
}

function client(port: number): Promise<{ socket: Socket; closed: Promise<void> }> {
  return new Promise((resolve, reject) => {
    const socket = connect({ host: '127.0.0.1', port });
    const closed = new Promise<void>((done) => socket.on('close', () => done()));
    socket.on('error', () => {});
    socket.once('connect', () => resolve({ socket, closed }));
    socket.once('error', reject);
  });
}

test('a request that reaches the main thread after Ctrl-C is answered as interrupted instead of carried out', TIMEOUT, async () => {
  const bridge = startHost();
  try {
    bridge.requested();
    assert.deepEqual(await bridge.send({ operation: 'accept', listener: 1 }), { interrupted: true });
    bridge.handled();
    assert.equal(typeof (await bridge.send({ operation: 'listen', host: '127.0.0.1', port: 0 }))['port'], 'number');
  } finally {
    bridge.close();
  }
});

test('Ctrl-C with nothing waiting sends no reply', TIMEOUT, async () => {
  const bridge = startHost();
  try {
    bridge.pressCtrlC();
    await pause(50);
    assert.equal(bridge.unread(), 0);
  } finally {
    bridge.close();
  }
});

test('Ctrl-C cancels a waiting accept, and a client arriving afterwards waits for the next accept instead of being lost', TIMEOUT, async () => {
  const bridge = startHost();
  try {
    const { listener, port } = await bridge.send({ operation: 'listen', host: '127.0.0.1', port: 0 });
    bridge.post({ operation: 'accept', listener });
    await pause(50);
    bridge.pressCtrlC();
    assert.deepEqual(await bridge.next(), { interrupted: true });
    bridge.handled();
    const late = await client(Number(port));
    await pause(100);
    assert.equal(bridge.unread(), 0, 'the cancelled accept must not hand the late client over');
    const accepted = await bridge.send({ operation: 'accept', listener });
    assert.equal(accepted['port'], late.socket.localPort);
  } finally {
    bridge.close();
  }
});

test('Ctrl-C cancels a waiting read of standard input, and input that arrives afterwards is kept for the next read', TIMEOUT, async () => {
  const input = new PassThrough();
  const bridge = startHost(() => input);
  try {
    bridge.post({ operation: 'read-input', length: 100 });
    await pause(50);
    bridge.pressCtrlC();
    assert.deepEqual(await bridge.next(), { interrupted: true });
    bridge.handled();
    input.write('late');
    await pause(50);
    assert.equal(bridge.unread(), 0, 'the cancelled read must not take the late input');
    assert.equal(text(await bridge.send({ operation: 'read-input', length: 100 })), 'late');
    input.end();
    assert.equal(text(await bridge.send({ operation: 'read-input', length: 100 })), '');
  } finally {
    bridge.close();
  }
});

test('a failure while the main thread handles a request becomes an internal reply, not an uncaught exception', TIMEOUT, async () => {
  const bridge = startHost(() => {
    throw new Error('standard input cannot be opened in this test');
  });
  try {
    const reply = await bridge.send({ operation: 'read-input', length: 100 });
    assert.match(String(reply['internal']), /standard input cannot be opened in this test/);
  } finally {
    bridge.close();
  }
});

test('closing the main thread side disconnects every client, accepted or waiting, and frees the port at once', TIMEOUT, async () => {
  const bridge = startHost();
  const { listener, port } = await bridge.send({ operation: 'listen', host: '127.0.0.1', port: 0 });
  const accepted = await client(Number(port));
  assert.equal((await bridge.send({ operation: 'accept', listener }))['port'], accepted.socket.localPort);
  const waiting = await client(Number(port));
  await pause(100);
  bridge.close();
  await within(Promise.all([accepted.closed, waiting.closed]), 5000, 'both clients to be disconnected');
  assert.equal(await portIsFree(Number(port)), true);
});
