import { readFileSync, readSync, writeSync } from 'node:fs';
import { Worker, isMainThread } from 'node:worker_threads';
import { BrokenPipe, EXIT_INTERNAL, EXIT_OK, EXIT_PROGRAM_ERROR, EXIT_USAGE, INTERNAL_ERROR_LINE, describeUnexpected, type CliIo } from './boundary.ts';
import { SlopersonsError } from './errors.ts';
import { ExitSignal, Interpreter, type Io } from './interpreter.ts';
import { parse } from './parser.ts';
import { Repl } from './repl.ts';
import { registerStdlib } from './stdlib/registry.ts';

const VERSION = '0.1.0';

const WORKER_STACK_MB = 256;
const DEFAULT_WORKER_HEAP_MB = 1024;

function workerHeapMb(): number {
  const raw = process.env['SLOPERSONS_MAX_HEAP_MB'];
  const parsed = raw === undefined ? Number.NaN : Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_WORKER_HEAP_MB;
}

export function createInterpreter(io: Io): Interpreter {
  const interpreter = new Interpreter(io);
  registerStdlib(interpreter);
  return interpreter;
}

export function runProgram(source: string, file: string, io: CliIo, interpreter: Interpreter = createInterpreter(io)): number {
  try {
    interpreter.run(parse(source));
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

function readLineFromStdin(): string | null {
  const buffer = Buffer.alloc(1);
  let line = '';
  while (true) {
    let read: number;
    try {
      read = readSync(0, buffer, 0, 1, null);
    } catch (error) {
      if (isWouldBlock(error)) {
        pauseBriefly();
        continue;
      }
      if (error instanceof Error && 'code' in error && error.code === 'EOF') read = 0;
      else throw error;
    }
    if (read === 0) return line.length === 0 ? null : line;
    const character = buffer.toString('utf8');
    if (character === '\n') return line.endsWith('\r') ? line.slice(0, -1) : line;
    line += character;
  }
}

export const nodeIo: CliIo = {
  write: (text) => writeAll(1, text),
  writeError: (text) => writeAll(2, text),
  readLine: readLineFromStdin,
};

export async function main(argv: string[], io: CliIo = nodeIo): Promise<number> {
  process.removeAllListeners('warning');
  process.on('warning', () => {});
  if (argv.includes('--version')) {
    io.write(`slopersons ${VERSION}\n`);
    return EXIT_OK;
  }
  if (argv.includes('--help') || argv.includes('-h')) {
    io.write('usage: slopersons <file.slop>\n       slopersons --repl\n       slopersons --version\n');
    return EXIT_OK;
  }
  if (argv.includes('--repl')) {
    if (io !== nodeIo) return new Repl(io, createInterpreter(io)).run();
    return runInWorker({ mode: 'repl' });
  }
  const path = argv[0];
  if (path === undefined) {
    io.writeError('usage: slopersons <file.slop>\n       slopersons --repl\n');
    return EXIT_USAGE;
  }
  let source: string;
  try {
    source = readFileSync(path, 'utf8');
  } catch {
    io.writeError(`error: cannot read file ${path}\n`);
    return EXIT_USAGE;
  }
  if (io !== nodeIo) return runProgram(source, path, io);
  return runInWorker({ mode: 'program', source, file: path });
}

export type WorkerData = { mode: 'program'; source: string; file: string } | { mode: 'repl' };

function runInWorker(data: WorkerData): Promise<number> {
  return new Promise((resolve) => {
    const worker = new Worker(new URL('./worker.ts', import.meta.url), {
      workerData: data,
      resourceLimits: { stackSizeMb: WORKER_STACK_MB, maxOldGenerationSizeMb: workerHeapMb() },
    });
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
    worker.on('exit', () => resolve(code));
  });
}
