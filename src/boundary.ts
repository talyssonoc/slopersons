import type { Interpreter, Io } from './interpreter.ts';
import { encodeUtf8 } from './runtime/utf8.ts';

export const EXIT_OK = 0;
export const EXIT_PROGRAM_ERROR = 1;
export const EXIT_USAGE = 2;
export const EXIT_INTERNAL = 70;

export const INTERNAL_ERROR_LINE = 'error: internal interpreter error; this is a bug in slopersons, not in your program\n';

export interface ReplIo extends Io {
  readLine(prompt: string): string | null;
}

export class BrokenPipe {}

export function lineInput(readLine: () => string | null): (buffer: Uint8Array) => number {
  let pending: Uint8Array = new Uint8Array(0);
  let offset = 0;
  return (buffer) => {
    if (offset === pending.length) {
      const line = readLine();
      if (line === null) return 0;
      pending = encodeUtf8(`${line}\n`);
      offset = 0;
    }
    const count = Math.min(buffer.length, pending.length - offset);
    buffer.set(pending.subarray(offset, offset + count));
    offset += count;
    return count;
  };
}

export function closeOpenStreams(interpreter: Interpreter, io: Io, code: number): number {
  const failures = interpreter.streams.closeAll();
  for (const message of failures) {
    try {
      io.writeError(`error: ${message}\n`);
    } catch (error) {
      if (!(error instanceof BrokenPipe)) throw error;
    }
  }
  return failures.length > 0 && code === EXIT_OK ? EXIT_PROGRAM_ERROR : code;
}

export const LINE_WAITING = 0;
export const LINE_READY = 1;
export const LINE_ENDED = 2;
export const REPL_LINE_BUFFER_BYTES = 1 << 20;

export interface ReadLineRequest {
  type: 'read-line';
  prompt: string;
}

export function isReadLineRequest(message: unknown): message is ReadLineRequest {
  return typeof message === 'object' && message !== null && 'type' in message && message.type === 'read-line' && 'prompt' in message && typeof message.prompt === 'string';
}

export function isStackOverflow(error: unknown): boolean {
  return error instanceof RangeError && /call stack/i.test(error.message);
}

export function describeUnexpected(error: unknown): string | null {
  if (isStackOverflow(error)) return 'error: the program recursed too deeply for the interpreter to continue\n';
  if (error instanceof RangeError) return 'error: a value grew too large for the interpreter to hold\n';
  return null;
}
