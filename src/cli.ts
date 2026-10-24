import { readFileSync, readSync, writeSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { MessageChannel, Worker, isMainThread } from 'node:worker_threads';
import {
  BrokenPipe,
  EXIT_INTERNAL,
  EXIT_OK,
  EXIT_PROGRAM_ERROR,
  EXIT_USAGE,
  INTERNAL_ERROR_LINE,
  LINE_ENDED,
  LINE_READY,
  REPL_LINE_BUFFER_BYTES,
  finishProgram,
  describeUnexpected,
  isReadLineRequest,
} from './boundary.ts';
import { SlopersonsError } from './errors.ts';
import { ExitSignal, Interpreter, type Io } from './interpreter.ts';
import { hostNetwork, type NetworkBridge } from './network.ts';
import type { Network } from './runtime/network.ts';
import { parse } from './parser.ts';
import { registerModules } from './modules.ts';
import { registerStdlib } from './stdlib/registry.ts';

const VERSION = '0.1.0';

const WORKER_STACK_MB = 256;
const DEFAULT_WORKER_HEAP_MB = 1024;

function workerHeapMb(): number {
  const raw = process.env['SLOPERSONS_MAX_HEAP_MB'];
  const parsed = raw === undefined ? Number.NaN : Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_WORKER_HEAP_MB;
}

export function createInterpreter(io: Io, programArguments: readonly string[] = [], network?: Network): Interpreter {
  const interpreter = new Interpreter(io, programArguments, network);
  registerStdlib(interpreter);
  registerModules(interpreter);
  return interpreter;
}

export function runProgram(source: string, file: string, io: Io, interpreter: Interpreter = createInterpreter(io)): number {
  return finishProgram(interpreter, io, execute(source, file, io, interpreter));
}

function execute(source: string, file: string, io: Io, interpreter: Interpreter): number {
  try {
    interpreter.currentFile = file;
    interpreter.run(parse(source, file));
    return EXIT_OK;
  } catch (error) {
    if (error instanceof ExitSignal) return error.code;
    if (error instanceof BrokenPipe) return EXIT_OK;
    if (error instanceof SlopersonsError) {
      io.writeError(`${error.withFile(file).format()}\n`);
      return EXIT_PROGRAM_ERROR;
    }
    const unexpected = describeUnexpected(error);
    if (unexpected !== null) {
      io.writeError(unexpected);
      return EXIT_PROGRAM_ERROR;
    }
    io.writeError(INTERNAL_ERROR_LINE);
    if (process.env['SLOPERSONS_DEBUG'] === '1') {
      io.writeError(`${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`);
    }
    return EXIT_INTERNAL;
  }
}

function isBrokenPipe(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'EPIPE';
}

function isWouldBlock(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'EAGAIN';
}

const sleepCell = new Int32Array(new SharedArrayBuffer(4));

function pauseBriefly(): void {
  if (!isMainThread) Atomics.wait(sleepCell, 0, 0, 1);
}

function writeAll(fileDescriptor: number, text: string): void {
  const bytes = Buffer.from(text, 'utf8');
  let offset = 0;
  while (offset < bytes.length) {
    try {
      offset += writeSync(fileDescriptor, bytes, offset, bytes.length - offset);
    } catch (error) {
      if (isWouldBlock(error)) {
        pauseBriefly();
        continue;
      }
      if (isBrokenPipe(error)) throw new BrokenPipe();
      throw error;
    }
  }
}

function readStandardInput(buffer: Uint8Array): number {
  while (true) {
    try {
      return readSync(0, buffer, 0, buffer.length, null);
    } catch (error) {
      if (isWouldBlock(error)) {
        pauseBriefly();
        continue;
      }
      if (error instanceof Error && 'code' in error && error.code === 'EOF') return 0;
      throw error;
    }
  }
}

export const nodeIo: Io = {
  write: (text) => writeAll(1, text),
  writeError: (text) => writeAll(2, text),
  readInput: readStandardInput,
};

const USAGE = 'usage: slopersons <file.slop> [arguments...]\n       slopersons --repl\n       slopersons --version\n';

export async function main(argv: string[]): Promise<number> {
  const io = nodeIo;
  process.removeAllListeners('warning');
  process.on('warning', () => {});
  const [path, ...programArguments] = argv;
  if (path === '--version') {
    io.write(`slopersons ${VERSION}\n`);
    return EXIT_OK;
  }
  if (path === '--help' || path === '-h') {
    io.write(USAGE);
    return EXIT_OK;
  }
  if (path === '--repl') {
    if (programArguments.length > 0) {
      io.writeError(`error: --repl takes no file or arguments\n${USAGE}`);
      return EXIT_USAGE;
    }
    return runReplInWorker();
  }
  if (path === undefined) {
    io.writeError(USAGE);
    return EXIT_USAGE;
  }
  if (path.startsWith('-')) {
    io.writeError(`error: unknown option ${path}\n${USAGE}`);
    return EXIT_USAGE;
  }
  let source: string;
  try {
    source = readFileSync(path, 'utf8');
  } catch {
    io.writeError(`error: cannot read file ${path}\n`);
    return EXIT_USAGE;
  }
  return runInWorker({ mode: 'program', source, file: path, programArguments });
}

type WorkerTask = { mode: 'program'; source: string; file: string; programArguments: string[] } | { mode: 'repl'; control: SharedArrayBuffer; data: SharedArrayBuffer };

export type WorkerData = WorkerTask & { network: NetworkBridge };

function runReplInWorker(): Promise<number> {
  const control = new SharedArrayBuffer(8);
  const data = new SharedArrayBuffer(REPL_LINE_BUFFER_BYTES);
  const controlView = new Int32Array(control);
  const dataView = new Uint8Array(data);
  const encoder = new TextEncoder();
  const queued: string[] = [];
  let ended = false;
  let waiting = false;
  const reader = createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY === true, historySize: 200 });
  const deliver = (line: string | null): void => {
    waiting = false;
    if (line === null) {
      Atomics.store(controlView, 1, 0);
      Atomics.store(controlView, 0, LINE_ENDED);
    } else {
      const { written } = encoder.encodeInto(line, dataView);
      Atomics.store(controlView, 1, written);
      Atomics.store(controlView, 0, LINE_READY);
    }
    Atomics.notify(controlView, 0);
  };
  reader.on('line', (line: string) => {
    if (waiting) deliver(line);
    else queued.push(line);
  });
  reader.on('close', () => {
    ended = true;
    if (waiting) deliver(null);
  });
  const onRequest = (prompt: string): void => {
    if (ended) {
      writeAll(1, prompt);
    } else {
      reader.setPrompt(prompt);
      reader.prompt();
    }
    const next = queued.shift();
    if (next !== undefined) deliver(next);
    else if (ended) deliver(null);
    else waiting = true;
  };
  return runInWorker({ mode: 'repl', control, data }, onRequest, () => reader.close());
}

declare const SLOPERSONS_WORKER_SOURCE: string | undefined;

function startWorker(data: WorkerData): Worker {
  const options = { workerData: data, transferList: [data.network.messages], resourceLimits: { stackSizeMb: WORKER_STACK_MB, maxOldGenerationSizeMb: workerHeapMb() } };
  if (typeof SLOPERSONS_WORKER_SOURCE === 'string') return new Worker(SLOPERSONS_WORKER_SOURCE, { ...options, eval: true });
  return new Worker(new URL('./worker.ts', import.meta.url), options);
}

function runInWorker(task: WorkerTask, onReadLine?: (prompt: string) => void, onExit?: () => void): Promise<number> {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const signal = new SharedArrayBuffer(4);
    const closeNetwork = hostNetwork({ messages: channel.port1, signal });
    const worker = startWorker({ ...task, network: { messages: channel.port2, signal } });
    let code = EXIT_INTERNAL;
    let pipeBroken = false;
    const onBrokenPipe = (error: unknown): void => {
      if (!isBrokenPipe(error)) throw error;
      if (pipeBroken) return;
      pipeBroken = true;
      code = EXIT_OK;
      void worker.terminate();
    };
    process.stdout.on('error', onBrokenPipe);
    process.stderr.on('error', onBrokenPipe);
    worker.on('message', (message: unknown) => {
      if (typeof message === 'number' && !pipeBroken) code = message;
      if (isReadLineRequest(message) && onReadLine !== undefined) onReadLine(message.prompt);
    });
    worker.on('error', (error: unknown) => {
      if (error instanceof Error && 'code' in error && error.code === 'ERR_WORKER_OUT_OF_MEMORY') {
        process.stderr.write(`error: the program ran out of memory (the limit is ${workerHeapMb()} MB)\n`);
        code = EXIT_PROGRAM_ERROR;
        return;
      }
      process.stderr.write(INTERNAL_ERROR_LINE);
      code = EXIT_INTERNAL;
    });
    worker.on('exit', () => {
      closeNetwork();
      onExit?.();
      resolve(code);
    });
  });
}
