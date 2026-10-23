import { readFileSync, readSync } from 'node:fs';
import { Worker } from 'node:worker_threads';
import { SloError } from './errors.ts';
import { ExitSignal, Interpreter, type Io } from './interpreter.ts';
import { parse } from './parser.ts';
import { registerStdlib } from './stdlib/registry.ts';

const VERSION = '0.1.0';

export const EXIT_OK = 0;
export const EXIT_PROGRAM_ERROR = 1;
export const EXIT_USAGE = 2;
export const EXIT_INTERNAL = 70;

const WORKER_STACK_MB = 256;
const DEFAULT_WORKER_HEAP_MB = 1024;

function workerHeapMb(): number {
  const raw = process.env['SLOPERSONS_MAX_HEAP_MB'];
  const parsed = raw === undefined ? Number.NaN : Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_WORKER_HEAP_MB;
}

export interface CliIo extends Io {
  writeError(text: string): void;
}

export function createInterpreter(io: Io): Interpreter {
  const interp = new Interpreter(io);
  registerStdlib(interp);
  return interp;
}

function isStackOverflow(error: unknown): boolean {
  return error instanceof RangeError && /call stack/i.test(error.message);
}

export function runProgram(source: string, file: string, io: CliIo, interp: Interpreter = createInterpreter(io)): number {
  try {
    interp.run(parse(source));
    return EXIT_OK;
  } catch (error) {
    if (error instanceof ExitSignal) return error.code;
    if (error instanceof SloError) {
      io.writeError(`${error.withFile(file).format()}\n`);
      return EXIT_PROGRAM_ERROR;
    }
    if (isStackOverflow(error)) {
      io.writeError('error: the program recursed too deeply for the interpreter to continue\n');
      return EXIT_PROGRAM_ERROR;
    }
    if (error instanceof RangeError) {
      io.writeError('error: a value grew too large for the interpreter to hold\n');
      return EXIT_PROGRAM_ERROR;
    }
    io.writeError('error: internal interpreter error; this is a bug in slopersons, not in your program\n');
    if (process.env['SLOPERSONS_DEBUG'] === '1') {
      io.writeError(`${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`);
    }
    return EXIT_INTERNAL;
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
      if (error instanceof Error && 'code' in error && error.code === 'EAGAIN') continue;
      if (error instanceof Error && 'code' in error && error.code === 'EOF') read = 0;
      else throw error;
    }
    if (read === 0) return line.length === 0 ? null : line;
    const ch = buffer.toString('utf8');
    if (ch === '\n') return line.endsWith('\r') ? line.slice(0, -1) : line;
    line += ch;
  }
}

export const nodeIo: CliIo = {
  write: (text) => {
    process.stdout.write(text);
  },
  writeError: (text) => {
    process.stderr.write(text);
  },
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
    io.write('usage: slopersons <file.slop>\n       slopersons --version\n');
    return EXIT_OK;
  }
  const path = argv[0];
  if (path === undefined) {
    io.writeError('usage: slopersons <file.slop>\n');
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
  return runInWorker(source, path);
}

function runInWorker(source: string, file: string): Promise<number> {
  return new Promise((resolve) => {
    const worker = new Worker(new URL('./worker.ts', import.meta.url), {
      workerData: { source, file },
      resourceLimits: { stackSizeMb: WORKER_STACK_MB, maxOldGenerationSizeMb: workerHeapMb() },
    });
    let code = EXIT_INTERNAL;
    worker.on('message', (message: unknown) => {
      if (typeof message === 'number') code = message;
    });
    worker.on('error', (error: unknown) => {
      if (error instanceof Error && 'code' in error && error.code === 'ERR_WORKER_OUT_OF_MEMORY') {
        process.stderr.write(`error: the program ran out of memory (the limit is ${workerHeapMb()} MB)\n`);
        code = EXIT_PROGRAM_ERROR;
        return;
      }
      process.stderr.write('error: internal interpreter error; this is a bug in slopersons, not in your program\n');
      code = EXIT_INTERNAL;
    });
    worker.on('exit', () => resolve(code));
  });
}
