import { SloError } from '../../src/errors.ts';
import { Interpreter } from '../../src/interpreter.ts';
import { parse } from '../../src/parser.ts';
import { registerStdlib } from '../../src/stdlib/registry.ts';
import { runProgram, type CliIo } from '../../src/cli.ts';

export interface RunResult {
  out: string;
  error: SloError | null;
}

export interface FakeIo extends CliIo {
  out: string;
  err: string;
}

export function fakeIo(inputLines: string[] = []): FakeIo {
  const pending = [...inputLines];
  const io: FakeIo = {
    out: '',
    err: '',
    write: (text) => {
      io.out += text;
    },
    writeError: (text) => {
      io.err += text;
    },
    readLine: () => pending.shift() ?? null,
  };
  return io;
}

export function run(source: string, inputLines: string[] = []): RunResult {
  const io = fakeIo(inputLines);
  const interp = new Interpreter(io);
  registerStdlib(interp);
  try {
    interp.run(parse(source));
    return { out: io.out, error: null };
  } catch (error) {
    if (error instanceof SloError) return { out: io.out, error };
    throw error;
  }
}

export function output(source: string): string {
  const result = run(source);
  if (result.error !== null) throw new Error(`unexpected error: ${result.error.message}`);
  return result.out;
}

export function failure(source: string): SloError {
  const result = run(source);
  if (result.error === null) throw new Error(`expected an error, got output: ${JSON.stringify(result.out)}`);
  return result.error;
}

export function runCli(source: string, inputLines: string[] = []): { code: number; io: FakeIo } {
  const io = fakeIo(inputLines);
  const code = runProgram(source, 'test.slop', io);
  return { code, io };
}
