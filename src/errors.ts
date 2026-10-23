export interface Pos {
  line: number;
  col: number;
}

export type ErrorKind = 'parse' | 'runtime';

export class SloError extends Error {
  kind: ErrorKind;
  pos: Pos | null;
  file: string | null;

  constructor(kind: ErrorKind, message: string, pos: Pos | null = null) {
    super(message);
    this.name = 'SloError';
    this.kind = kind;
    this.pos = pos;
    this.file = null;
  }

  withFile(file: string): SloError {
    this.file = file;
    return this;
  }

  format(): string {
    const where = this.pos === null ? '' : `\n  at ${this.file ?? '<input>'}:${this.pos.line}:${this.pos.col}`;
    return `error: ${this.message}${where}`;
  }
}

export function parseError(message: string, pos: Pos | null): SloError {
  return new SloError('parse', message, pos);
}

export function runtimeError(message: string, pos: Pos | null): SloError {
  return new SloError('runtime', message, pos);
}
