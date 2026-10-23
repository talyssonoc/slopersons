export interface Position {
  line: number;
  col: number;
}

export type ErrorKind = 'parse' | 'runtime';

export class SlopersonsError extends Error {
  kind: ErrorKind;
  position: Position | null;
  file: string | null;
  incomplete: boolean;

  constructor(kind: ErrorKind, message: string, location: Position | null = null) {
    super(message);
    this.name = 'SlopersonsError';
    this.kind = kind;
    this.position = location;
    this.file = null;
    this.incomplete = false;
  }

  withFile(file: string): SlopersonsError {
    this.file = file;
    return this;
  }

  format(): string {
    const where = this.position === null ? '' : `\n  at ${this.file ?? '<input>'}:${this.position.line}:${this.position.col}`;
    return `error: ${this.message}${where}`;
  }
}

export function parseError(message: string, position: Position | null): SlopersonsError {
  return new SlopersonsError('parse', message, position);
}

export function incompleteError(message: string, position: Position | null): SlopersonsError {
  const error = new SlopersonsError('parse', message, position);
  error.incomplete = true;
  return error;
}

export function runtimeError(message: string, position: Position | null): SlopersonsError {
  return new SlopersonsError('runtime', message, position);
}
