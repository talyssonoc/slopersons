import { connect, createServer, type Server, type Socket } from 'node:net';
import { receiveMessageOnPort, type MessagePort } from 'node:worker_threads';
import { NetworkFailure, type Connected, type Listening, type Network } from './runtime/network.ts';
import { STREAM_BUFFER_BYTES } from './runtime/stream.ts';

export const WAITING_CONNECTIONS_LIMIT = 10;

const EMPTY = new Uint8Array(0);

const REASONS: Record<string, string> = {
  EACCES: 'permission denied',
  EADDRINUSE: 'the address is already in use',
  EADDRNOTAVAIL: 'the address does not belong to this machine',
  EAI_AGAIN: 'the host name could not be looked up right now',
  ECONNABORTED: 'the connection was aborted',
  ECONNREFUSED: 'the connection was refused',
  ECONNRESET: 'the other side reset the connection',
  EHOSTUNREACH: 'the host cannot be reached',
  EMFILE: 'too many files are open',
  ENETUNREACH: 'the network cannot be reached',
  ENFILE: 'too many files are open',
  ENOTFOUND: 'the host was not found',
  EPIPE: 'the other side closed the connection',
  ETIMEDOUT: 'the connection timed out',
};

function reasonFor(error: unknown): string {
  const code = error instanceof Error && 'code' in error && typeof error.code === 'string' ? error.code : null;
  if (code === null) return 'the operating system reported an unknown failure';
  return REASONS[code] ?? `the operating system reported ${code}`;
}

function duration(milliseconds: number): string {
  if (milliseconds % 1000 === 0) return milliseconds === 1000 ? '1 second' : `${milliseconds / 1000} seconds`;
  return milliseconds === 1 ? '1 millisecond' : `${milliseconds} milliseconds`;
}

type Request =
  | { operation: 'listen'; host: string; port: number }
  | { operation: 'accept'; listener: number }
  | { operation: 'connect'; host: string; port: number; timeout: number | null }
  | { operation: 'read'; connection: number; length: number; timeout: number | null }
  | { operation: 'write'; connection: number; bytes: Uint8Array; timeout: number | null }
  | { operation: 'close-connection'; connection: number }
  | { operation: 'close-listener'; listener: number };

type Reply = { failure: string } | Listening | Connected | { bytes: Uint8Array } | { done: true };

export interface NetworkBridge {
  messages: MessagePort;
  signal: SharedArrayBuffer;
}

interface ConnectionEntry {
  socket: Socket;
  pending: Uint8Array;
  ended: boolean;
  failure: string | null;
  wake: (() => void) | null;
}

interface ListenerEntry {
  server: Server;
  waiting: ConnectionEntry[];
  acceptor: ((entry: ConnectionEntry) => void) | null;
}

function track(socket: Socket): ConnectionEntry {
  const entry: ConnectionEntry = { socket, pending: EMPTY, ended: false, failure: null, wake: null };
  socket.on('error', (error) => {
    entry.failure ??= reasonFor(error);
    entry.wake?.();
  });
  socket.on('end', () => {
    entry.ended = true;
    entry.wake?.();
  });
  socket.on('close', () => {
    entry.failure ??= 'the connection is closed';
    entry.wake?.();
  });
  return entry;
}

function startReading(entry: ConnectionEntry): void {
  entry.socket.on('readable', () => entry.wake?.());
}

export function hostNetwork(bridge: NetworkBridge): () => void {
  const signal = new Int32Array(bridge.signal);
  const listeners = new Map<number, ListenerEntry>();
  const connections = new Map<number, ConnectionEntry>();
  let nextId = 1;

  const reply = (message: Reply): void => {
    bridge.messages.postMessage(message);
    Atomics.store(signal, 0, 1);
    Atomics.notify(signal, 0);
  };

  const afterTimeout = (timeout: number | null, expire: () => void): (() => void) => {
    if (timeout === null) return () => {};
    const timer = setTimeout(expire, timeout);
    timer.unref();
    return () => clearTimeout(timer);
  };

  const register = (entry: ConnectionEntry): number => {
    const id = nextId++;
    connections.set(id, entry);
    return id;
  };

  const listen = (host: string, port: number): void => {
    const server = createServer({ pauseOnConnect: true, allowHalfOpen: true });
    const entry: ListenerEntry = { server, waiting: [], acceptor: null };
    const failed = (error: unknown): void => reply({ failure: reasonFor(error) });
    server.once('error', failed);
    server.on('connection', (socket) => {
      const connection = track(socket);
      if (entry.acceptor !== null) {
        const acceptor = entry.acceptor;
        entry.acceptor = null;
        acceptor(connection);
      } else if (entry.waiting.length >= WAITING_CONNECTIONS_LIMIT) {
        socket.destroy();
      } else {
        entry.waiting.push(connection);
        socket.once('close', () => {
          const index = entry.waiting.findIndex((waiting) => waiting === connection);
          if (index >= 0) entry.waiting.splice(index, 1);
        });
      }
    });
    server.listen({ host, port }, () => {
      server.removeListener('error', failed);
      server.on('error', () => {});
      const address = server.address();
      const id = nextId++;
      listeners.set(id, entry);
      reply({ listener: id, port: address !== null && typeof address === 'object' ? address.port : port });
    });
  };

  const accept = (listener: number): void => {
    const entry = listeners.get(listener);
    if (entry === undefined) return reply({ failure: 'the listener is closed' });
    const handOver = (connection: ConnectionEntry): void => {
      startReading(connection);
      reply({ connection: register(connection), host: connection.socket.remoteAddress ?? 'unknown', port: connection.socket.remotePort ?? 0 });
    };
    const next = entry.waiting.shift();
    if (next !== undefined) handOver(next);
    else entry.acceptor = handOver;
  };

  const open = (host: string, port: number, timeout: number | null): void => {
    const socket = connect({ host, port, allowHalfOpen: true });
    let settled = false;
    const settle = (message: Reply): void => {
      if (settled) return;
      settled = true;
      cancel();
      reply(message);
    };
    const cancel = afterTimeout(timeout, () => {
      settle({ failure: `no answer within ${duration(timeout ?? 0)}` });
      socket.destroy();
    });
    socket.once('error', (error) => settle({ failure: reasonFor(error) }));
    socket.once('connect', () => {
      const connection = track(socket);
      startReading(connection);
      settle({ connection: register(connection), host, port });
    });
  };

  const read = (entry: ConnectionEntry, length: number, timeout: number | null): void => {
    const take = (): Reply | null => {
      if (entry.pending.length > 0) {
        const bytes = entry.pending.slice(0, length);
        entry.pending = entry.pending.subarray(bytes.length);
        return { bytes };
      }
      if (entry.ended) return { bytes: EMPTY };
      if (entry.failure !== null) return { failure: entry.failure };
      const chunk: unknown = entry.socket.read();
      if (chunk instanceof Uint8Array) {
        entry.pending = chunk;
        return take();
      }
      return null;
    };
    const ready = take();
    if (ready !== null) return reply(ready);
    const cancel = afterTimeout(timeout, () => {
      entry.wake = null;
      reply({ failure: `nothing arrived within ${duration(timeout ?? 0)}` });
    });
    entry.wake = () => {
      const result = take();
      if (result === null) return;
      entry.wake = null;
      cancel();
      reply(result);
    };
  };

  const write = (entry: ConnectionEntry, bytes: Uint8Array, timeout: number | null): void => {
    if (entry.failure !== null) return reply({ failure: entry.failure });
    let settled = false;
    const cancel = afterTimeout(timeout, () => {
      if (settled) return;
      settled = true;
      entry.failure = `the other side did not take the data within ${duration(timeout ?? 0)}`;
      entry.socket.destroy();
      reply({ failure: entry.failure });
    });
    entry.socket.write(bytes, (error) => {
      if (settled) return;
      settled = true;
      cancel();
      reply(error === null || error === undefined ? { done: true } : { failure: entry.failure ?? reasonFor(error) });
    });
  };

  const closeListener = (entry: ListenerEntry): void => {
    entry.server.close();
    for (const waiting of entry.waiting) waiting.socket.destroy();
    entry.waiting.length = 0;
  };

  bridge.messages.on('message', (request: Request) => {
    switch (request.operation) {
      case 'listen':
        return listen(request.host, request.port);
      case 'accept':
        return accept(request.listener);
      case 'connect':
        return open(request.host, request.port, request.timeout);
      case 'read': {
        const entry = connections.get(request.connection);
        if (entry === undefined) return reply({ failure: 'the connection is closed' });
        return read(entry, request.length, request.timeout);
      }
      case 'write': {
        const entry = connections.get(request.connection);
        if (entry === undefined) return reply({ failure: 'the connection is closed' });
        return write(entry, request.bytes, request.timeout);
      }
      case 'close-connection':
        connections.get(request.connection)?.socket.destroy();
        connections.delete(request.connection);
        return reply({ done: true });
      case 'close-listener': {
        const entry = listeners.get(request.listener);
        if (entry !== undefined) closeListener(entry);
        listeners.delete(request.listener);
        return reply({ done: true });
      }
    }
  });

  return () => {
    for (const entry of listeners.values()) closeListener(entry);
    for (const entry of connections.values()) entry.socket.destroy();
    listeners.clear();
    connections.clear();
    bridge.messages.close();
  };
}

export function bridgedNetwork(bridge: NetworkBridge): Network {
  const signal = new Int32Array(bridge.signal);
  const call = (request: Request): Reply => {
    Atomics.store(signal, 0, 0);
    bridge.messages.postMessage(request);
    Atomics.wait(signal, 0, 0);
    const received = receiveMessageOnPort(bridge.messages);
    if (received === undefined) throw new Error('the main thread answered a network request without a reply');
    const reply = received.message as Reply;
    if ('failure' in reply) throw new NetworkFailure(reply.failure);
    return reply;
  };
  return {
    listen: (host, port) => call({ operation: 'listen', host, port }) as Listening,
    accept: (listener) => call({ operation: 'accept', listener }) as Connected,
    connect: (host, port, timeout) => call({ operation: 'connect', host, port, timeout }) as Connected,
    read: (connection, buffer, start, length, timeout) => {
      const { bytes } = call({ operation: 'read', connection, length: Math.min(length, STREAM_BUFFER_BYTES), timeout }) as { bytes: Uint8Array };
      buffer.set(bytes, start);
      return bytes.length;
    },
    write: (connection, bytes, start, length, timeout) => {
      call({ operation: 'write', connection, bytes: bytes.slice(start, start + length), timeout });
    },
    closeConnection: (connection) => {
      call({ operation: 'close-connection', connection });
    },
    closeListener: (listener) => {
      call({ operation: 'close-listener', listener });
    },
  };
}
