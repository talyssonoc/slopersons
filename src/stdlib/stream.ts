import { runtimeError } from '../errors.ts';
import type { CallContext, Interpreter } from '../interpreter.ts';
import type { Stream } from '../runtime/stream.ts';
import { NOTHING, describeType, formatValue, string, type Value } from '../values.ts';
import { input, runIo } from './core.ts';

function expectStream(value: Value, what: string, context: CallContext): Stream {
  if (value.type !== 'stream') throw runtimeError(`${what} must be a stream, got ${describeType(value)}`, context.position);
  return value.stream;
}

export function registerStream(interpreter: Interpreter): void {
  interpreter.defineIn('stream', 'read-line', 1, (inputs, context) => {
    const stream = expectStream(input(inputs, 0), 'the input of `stream/read-line`', context);
    const line = runIo(context, () => stream.readLine());
    return line === null ? NOTHING : string(line);
  });

  interpreter.defineIn('stream', 'read-all', 1, (inputs, context) => {
    const stream = expectStream(input(inputs, 0), 'the input of `stream/read-all`', context);
    return string(runIo(context, () => stream.readAll()));
  });

  interpreter.defineIn('stream', 'write', 2, (inputs, context) => {
    const stream = expectStream(input(inputs, 0), 'the input of `stream/write`', context);
    runIo(context, () => stream.write(formatValue(input(inputs, 1), 'print')));
    return input(inputs, 0);
  });

  interpreter.defineIn('stream', 'write-line', 2, (inputs, context) => {
    const stream = expectStream(input(inputs, 0), 'the input of `stream/write-line`', context);
    runIo(context, () => stream.write(`${formatValue(input(inputs, 1), 'print')}\n`));
    return input(inputs, 0);
  });

  interpreter.defineIn('stream', 'flush', 1, (inputs, context) => {
    const stream = expectStream(input(inputs, 0), 'the input of `stream/flush`', context);
    runIo(context, () => stream.flush());
    return input(inputs, 0);
  });

  interpreter.defineIn('stream', 'close', 1, (inputs, context) => {
    const stream = expectStream(input(inputs, 0), 'the input of `stream/close`', context);
    runIo(context, () => stream.close());
    return NOTHING;
  });
}
