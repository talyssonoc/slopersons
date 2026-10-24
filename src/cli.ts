import { readFileSync, writeSync } from 'node:fs';
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
  LINE_INTERRUPTED,
  LINE_READY,
  REPL_LINE_BUFFER_BYTES,
  finishProgram,
  describeUnexpected,
  isReadLineRequest,
} from './boundary.ts';
import { SlopersonsError } from './errors.ts';
import { INTERRUPT_NONE, INTERRUPT_REQUESTED, hostBridge, type Bridge } from './bridge.ts';
import { ExitSignal, Interpreter, type InterpreterOptions, type Io } from './interpreter.ts';
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

export function createInterpreter(io: Io, options: InterpreterOptions = {}): Interpreter {
  const interpreter = new Interpreter(io, options);
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

export const nodeOutput: Pick<Io, 'write' | 'writeError'> = {
  write: (text) => writeAll(1, text),
  writeError: (text) => writeAll(2, text),
};

const USAGE = 'usage: slopersons <file.slop> [arguments...]\n       slopersons --repl\n       slopersons --version\n';

export async function main(argv: string[]): Promise<number> {
  const io = nodeOutput;
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

export type WorkerData = WorkerTask & { bridge: Bridge };

interface WorkerHooks {
  onReadLine?: (prompt: string, interrupted: boolean) => void;
  onInterrupt?: () => void;
  onExit?: () => void;
}

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
  const deliver = (state: number, length: number): void => {
    waiting = false;
    Atomics.store(controlView, 1, length);
    Atomics.store(controlView, 0, state);
    Atomics.notify(controlView, 0);
  };
  const deliverLine = (line: string | null): void => {
    if (line === null) deliver(LINE_ENDED, 0);
    else deliver(LINE_READY, encoder.encodeInto(line, dataView).written);
  };
  reader.on('line', (line: string) => {
    if (waiting) deliverLine(line);
    else queued.push(line);
  });
  reader.on('close', () => {
    ended = true;
    if (waiting) deliverLine(null);
  });
  reader.on('SIGINT', () => {
    if (waiting && process.stdin.isTTY === true) {
      reader.write(null, { ctrl: true, name: 'e' });
      reader.write(null, { ctrl: true, name: 'u' });
    }
    process.emit('SIGINT');
  });
  const onRequest = (prompt: string, interrupted: boolean): void => {
    if (interrupted) return deliver(LINE_INTERRUPTED, 0);
    if (ended) {
      writeAll(1, prompt);
    } else {
      reader.setPrompt(prompt);
      reader.prompt();
    }
    const next = queued.shift();
    if (next !== undefined) deliverLine(next);
    else if (ended) deliverLine(null);
    else waiting = true;
  };
  const onInterrupt = (): void => {
    if (waiting) deliver(LINE_INTERRUPTED, 0);
  };
  return runInWorker({ mode: 'repl', control, data }, { onReadLine: onRequest, onInterrupt, onExit: () => reader.close() });
}

declare const SLOPERSONS_WORKER_SOURCE: string | undefined;

function startWorker(data: WorkerData): Worker {
  const options = { workerData: data, transferList: [data.bridge.messages], resourceLimits: { stackSizeMb: WORKER_STACK_MB, maxOldGenerationSizeMb: workerHeapMb() } };
  if (typeof SLOPERSONS_WORKER_SOURCE === 'string') return new Worker(SLOPERSONS_WORKER_SOURCE, { ...options, eval: true });
  return new Worker(new URL('./worker.ts', import.meta.url), options);
}

function runInWorker(task: WorkerTask, hooks: WorkerHooks = {}): Promise<number> {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const shared = { signal: new SharedArrayBuffer(4), interrupt: new SharedArrayBuffer(4) };
    const host = hostBridge({ messages: channel.port1, ...shared }, () => process.stdin);
    const worker = startWorker({ ...task, bridge: { messages: channel.port2, ...shared } });
    const interruptCell = new Int32Array(shared.interrupt);
    let code = EXIT_INTERNAL;
    let pipeBroken = false;
    let failed = false;
    const onBrokenPipe = (error: unknown): void => {
      if (!isBrokenPipe(error)) throw error;
      if (pipeBroken) return;
      pipeBroken = true;
      code = EXIT_OK;
      void worker.terminate();
    };
    const onInterrupt = (): void => {
      if (Atomics.load(interruptCell, 0) !== INTERRUPT_NONE) {
        // The worker may be stuck in a system call that terminate() cannot interrupt, so the second Ctrl-C ends the process the way an unhandled SIGINT does.
        process.removeListener('SIGINT', onInterrupt);
        process.kill(process.pid, 'SIGINT');
        return;
      }
      Atomics.store(interruptCell, 0, INTERRUPT_REQUESTED);
      host.interrupt();
      hooks.onInterrupt?.();
    };
    const onUncaught = (error: unknown): void => {
      process.stderr.write(INTERNAL_ERROR_LINE);
      if (process.env['SLOPERSONS_DEBUG'] === '1') process.stderr.write(`${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`);
      failed = true;
      code = EXIT_INTERNAL;
      void worker.terminate();
    };
    process.stdout.on('error', onBrokenPipe);
    process.stderr.on('error', onBrokenPipe);
    process.on('SIGINT', onInterrupt);
    process.on('uncaughtException', onUncaught);
    worker.on('message', (message: unknown) => {
      if (typeof message === 'number' && !pipeBroken && !failed) code = message;
      if (isReadLineRequest(message) && hooks.onReadLine !== undefined) hooks.onReadLine(message.prompt, Atomics.load(interruptCell, 0) === INTERRUPT_REQUESTED);
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
      process.removeListener('SIGINT', onInterrupt);
      process.removeListener('uncaughtException', onUncaught);
      try {
        host.close();
        hooks.onExit?.();
      } finally {
        resolve(code);
      }
    });
  });
}
