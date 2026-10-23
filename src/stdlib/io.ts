import { systemFailure } from '../file-system.ts';
import type { Interpreter, Io } from '../interpreter.ts';
import { ChannelStream, TextOutputStream, type ByteChannel } from '../runtime/stream.ts';
import { NOTHING, array, formatValue, streamValue, string } from '../values.ts';
import { input, runIo } from './core.ts';

function standardInputChannel(io: Io): ByteChannel {
  return {
    positioned: false,
    read: (buffer, start, length) => {
      try {
        return io.readInput(buffer.subarray(start, start + length));
      } catch (error) {
        throw systemFailure('read', 'standard input', error);
      }
    },
    write: () => {
      throw new Error('standard input is opened for reading only, so nothing writes to its channel');
    },
    close: () => {},
  };
}

export function registerIo(interpreter: Interpreter): void {
  const io = interpreter.io;
  const standardInput = new ChannelStream({ label: 'stdin', description: 'standard input', mode: 'read', channel: standardInputChannel(io), standard: true, registry: null });
  const standardOutput = new TextOutputStream('stdout', 'standard output', (text) => io.write(text));
  const standardError = new TextOutputStream('stderr', 'standard error', (text) => io.writeError(text));

  interpreter.defineIn('io', 'print-line', 1, (inputs) => {
    standardOutput.write(`${formatValue(input(inputs, 0), 'print')}\n`);
    return input(inputs, 0);
  });

  interpreter.defineIn('io', 'print', 1, (inputs) => {
    standardOutput.write(formatValue(input(inputs, 0), 'print'));
    return input(inputs, 0);
  });

  interpreter.defineIn('io', 'read-line', 0, (_inputs, context) => {
    const line = runIo(context, () => standardInput.readLine());
    return line === null ? NOTHING : string(line);
  });

  interpreter.defineIn('io', 'arguments', 0, (_inputs, context) => array(context.interpreter.programArguments.map(string)));

  interpreter.defineValueIn('io', 'stdin', streamValue(standardInput));
  interpreter.defineValueIn('io', 'stdout', streamValue(standardOutput));
  interpreter.defineValueIn('io', 'stderr', streamValue(standardError));
}
