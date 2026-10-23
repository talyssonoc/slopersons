import type { Io } from './interpreter.ts';

export const EXIT_OK = 0;
export const EXIT_PROGRAM_ERROR = 1;
export const EXIT_USAGE = 2;
export const EXIT_INTERNAL = 70;

export const INTERNAL_ERROR_LINE = 'error: internal interpreter error; this is a bug in slopersons, not in your program\n';

export interface CliIo extends Io {
  writeError(text: string): void;
}

export class BrokenPipe {}

export function isStackOverflow(error: unknown): boolean {
  return error instanceof RangeError && /call stack/i.test(error.message);
}

export function describeUnexpected(error: unknown): string | null {
  if (isStackOverflow(error)) return 'error: the program recursed too deeply for the interpreter to continue\n';
  if (error instanceof RangeError) return 'error: a value grew too large for the interpreter to hold\n';
  return null;
}
