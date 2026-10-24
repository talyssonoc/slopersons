import { after } from 'node:test';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { connect, createServer, type Server, type Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const programs = new Set<ChildProcess>();
const sockets = new Set<Socket>();
const servers = new Set<Server>();

after(() => {
  for (const program of programs) program.kill();
  for (const socket of sockets) socket.destroy();
  for (const server of servers) server.close();
});

export function within<Result>(promise: Promise<Result>, milliseconds: number, waitingFor: string): Promise<Result> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`gave up after ${milliseconds} ms waiting for ${waitingFor}`)), milliseconds);
    promise.then(
      (result) => {
        clearTimeout(timer);
        resolve(result);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

export interface Finished {
  stdout: string;
  stderr: string;
  code: number | null;
}

export interface RunningProgram {
  path: string;
  child: ChildProcess;
  firstLine: Promise<string>;
  finished: Promise<Finished>;
  printed: (text: string) => Promise<void>;
}

export function startProgram(command: readonly string[], source: string, programArguments: readonly string[] = []): RunningProgram {
  const [executable, ...leading] = command;
  if (executable === undefined) throw new Error('a command needs an executable');
  const cwd = mkdtempSync(join(tmpdir(), 'slopersons-network-'));
  const path = join(cwd, 'program.slop');
  writeFileSync(path, source);
  const child = spawn(executable, [...leading, path, ...programArguments], { cwd });
  programs.add(child);
  child.on('close', () => programs.delete(child));
  let stdout = '';
  let stderr = '';
  const waiting: { text: string; resolve: () => void }[] = [];
  const printed = (text: string): Promise<void> =>
    new Promise((resolve) => {
      if (stdout.includes(text)) resolve();
      else waiting.push({ text, resolve });
    });
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk: string) => {
    stderr += chunk;
  });
  const firstLine = new Promise<string>((resolve, reject) => {
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
      for (const waiter of waiting) if (stdout.includes(waiter.text)) waiter.resolve();
      const end = stdout.indexOf('\n');
      if (end >= 0) resolve(stdout.slice(0, end));
    });
    child.on('exit', () => reject(new Error(`the program ended before printing a line; stderr: ${stderr}`)));
  });
  firstLine.catch(() => {});
  const finished = new Promise<Finished>((resolve) => child.on('close', (code) => resolve({ stdout, stderr, code })));
  return { path, child, firstLine, finished, printed };
}

export async function listeningPort(program: RunningProgram): Promise<number> {
  return Number(await program.firstLine);
}

export interface Ended {
  data: string;
  error: string | null;
}

export interface Client {
  socket: Socket;
  ended: Promise<Ended>;
  isEnded: () => boolean;
}

export function openClient(port: number): Promise<Client> {
  return new Promise((resolve, reject) => {
    const socket = connect({ host: '127.0.0.1', port });
    sockets.add(socket);
    socket.setEncoding('utf8');
    let data = '';
    let error: string | null = null;
    let done = false;
    socket.on('data', (chunk: string) => {
      data += chunk;
    });
    socket.on('error', (failure: Error & { code?: string }) => {
      error = failure.code ?? failure.message;
    });
    const ended = new Promise<Ended>((finish) =>
      socket.on('close', () => {
        sockets.delete(socket);
        done = true;
        finish({ data, error });
      }),
    );
    socket.once('connect', () => resolve({ socket, ended, isEnded: () => done }));
    socket.once('error', reject);
  });
}

export function startServer(onConnection: (socket: Socket) => void): Promise<{ server: Server; port: number }> {
  return new Promise((resolve) => {
    const server = createServer(onConnection);
    servers.add(server);
    server.on('close', () => servers.delete(server));
    server.listen({ host: '127.0.0.1', port: 0 }, () => {
      const address = server.address();
      resolve({ server, port: address !== null && typeof address === 'object' ? address.port : 0 });
    });
  });
}

export async function closedPort(): Promise<number> {
  const { server, port } = await startServer(() => {});
  await new Promise((resolve) => server.close(resolve));
  return port;
}

export const ECHO_SERVER = [
  '"127.0.0.1" -> socket/listen 0 => listener',
  'listener -> socket/port -> io/print-line',
  '0 => served',
  'while served < 3',
  '| listener -> socket/accept => connection',
  '| attempt',
  '| | connection -> stream/read-line => line',
  '| | connection -> stream/write-line "#{served} you said: {line}"',
  '| recover problem',
  '| | io/stderr -> stream/write-line "connection failed: {problem}"',
  '| always',
  '| | connection -> stream/close',
  '| served + 1 => served',
  '"served {served}" -> io/print-line',
  '',
].join('\n');

export async function talkToEchoServer(command: readonly string[]): Promise<{ replies: string[]; finished: Finished }> {
  const program = startProgram(command, ECHO_SERVER);
  try {
    const port = await listeningPort(program);
    const labels = ['first', 'second', 'third'];
    const clients: Client[] = [];
    for (let i = 0; i < labels.length; i++) clients.push(await openClient(port));
    labels.forEach((label, index) => clients[index]?.socket.write(`${label}\n`));
    const replies = await Promise.all(clients.map(async (client) => (await client.ended).data));
    return { replies, finished: await program.finished };
  } finally {
    program.child.kill();
  }
}
