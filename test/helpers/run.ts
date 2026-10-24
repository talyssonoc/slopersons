import { SlopersonsError } from '../../src/errors.ts';
import { Interpreter } from '../../src/interpreter.ts';
import { parse } from '../../src/parser.ts';
import { registerStdlib } from '../../src/stdlib/registry.ts';
import { lineInput, type ReplIo } from '../../src/boundary.ts';
import { createInterpreter, runProgram } from '../../src/cli.ts';
import { NO_NETWORK, type Network } from '../../src/runtime/network.ts';

export interface RunResult {
  out: string;
  error: SlopersonsError | null;
}

export interface FakeIo extends ReplIo {
  out: string;
  error: string;
}

export function fakeIo(inputLines: string[] = []): FakeIo {
  const pending = [...inputLines];
  const io: FakeIo = {
    out: '',
    error: '',
    write: (text) => {
      io.out += text;
    },
    writeError: (text) => {
      io.error += text;
    },
    readLine: (prompt) => {
      io.out += prompt;
      return pending.shift() ?? null;
    },
    readInput: lineInput(() => pending.shift() ?? null),
  };
  return io;
}

export function run(source: string, inputLines: string[] = [], network: Network = NO_NETWORK): RunResult {
  const io = fakeIo(inputLines);
  const interpreter = new Interpreter(io, { network });
  registerStdlib(interpreter);
  try {
    interpreter.run(parse(source));
    return { out: io.out, error: null };
  } catch (error) {
    if (error instanceof SlopersonsError) return { out: io.out, error };
    throw error;
  } finally {
    interpreter.streams.closeAll();
  }
}

export function output(source: string): string {
  const result = run(source);
  if (result.error !== null) throw new Error(`unexpected error: ${result.error.message}`);
  return result.out;
}

export function failure(source: string): SlopersonsError {
  const result = run(source);
  if (result.error === null) throw new Error(`expected an error, got output: ${JSON.stringify(result.out)}`);
  return result.error;
}

export function runCli(source: string, inputLines: string[] = [], programArguments: string[] = []): { code: number; io: FakeIo } {
  const io = fakeIo(inputLines);
  const code = runProgram(source, 'test.slop', io, createInterpreter(io, { programArguments }));
  return { code, io };
}
