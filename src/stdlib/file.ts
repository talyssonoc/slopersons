import { runtimeError } from '../errors.ts';
import { listDirectory, openFile, pathKind, removeFile } from '../file-system.ts';
import type { CallContext, Interpreter } from '../interpreter.ts';
import { stableSort } from '../runtime/sorting.ts';
import { ChannelStream, type StreamMode } from '../runtime/stream.ts';
import { encodeUtf8 } from '../runtime/utf8.ts';
import { NOTHING, array, boolean, compareValues, formatValue, streamValue, string, type Value } from '../values.ts';
import { expectString, input, runIo } from './core.ts';

function describePath(path: string): string {
  return formatValue(string(path), 'show');
}

function expectMode(value: Value, context: CallContext): StreamMode {
  const mode = expectString(value, 'the mode of `file/open`', context);
  if (mode === 'read' || mode === 'write' || mode === 'append' || mode === 'read-write') return mode;
  throw runtimeError(`the mode of \`file/open\` must be "read", "write", "append" or "read-write", got ${formatValue(value, 'show')}`, context.position);
}

function closeAfter<Result>(close: () => void, body: () => Result): Result {
  let result: Result;
  try {
    result = body();
  } catch (error) {
    try {
      close();
    } catch {
      // the failure that interrupted the body is the one to report
    }
    throw error;
  }
  close();
  return result;
}

function writeWhole(path: string, mode: 'write' | 'append', text: string): void {
  const channel = openFile(path, mode, describePath(path));
  closeAfter(
    () => channel.close(),
    () => {
      const bytes = encodeUtf8(text);
      channel.write(bytes, 0, bytes.length, null);
    },
  );
}

export function registerFile(interpreter: Interpreter): void {
  interpreter.defineIn('file', 'open', 2, (inputs, context) => {
    const path = expectString(input(inputs, 0), 'the path of `file/open`', context);
    const mode = expectMode(input(inputs, 1), context);
    const description = describePath(path);
    return runIo(context, () => {
      const channel = openFile(path, mode, description);
      return streamValue(new ChannelStream({ label: path, description, mode, channel, standard: false, registry: context.interpreter.streams }));
    });
  });

  interpreter.defineIn('file', 'read', 1, (inputs, context) => {
    const path = expectString(input(inputs, 0), 'the path of `file/read`', context);
    const description = describePath(path);
    const text = runIo(context, () => {
      const stream = new ChannelStream({ label: path, description, mode: 'read', channel: openFile(path, 'read', description), standard: false, registry: null });
      return closeAfter(
        () => stream.close(),
        () => stream.readAll(),
      );
    });
    return string(text);
  });

  interpreter.defineIn('file', 'write', 2, (inputs, context) => {
    const path = expectString(input(inputs, 0), 'the path of `file/write`', context);
    runIo(context, () => writeWhole(path, 'write', formatValue(input(inputs, 1), 'print')));
    return input(inputs, 0);
  });

  interpreter.defineIn('file', 'append', 2, (inputs, context) => {
    const path = expectString(input(inputs, 0), 'the path of `file/append`', context);
    runIo(context, () => writeWhole(path, 'append', formatValue(input(inputs, 1), 'print')));
    return input(inputs, 0);
  });

  interpreter.defineIn('file', 'exists', 1, (inputs, context) => boolean(pathKind(expectString(input(inputs, 0), 'the path of `file/exists`', context)) !== null));

  interpreter.defineIn('file', 'is-directory', 1, (inputs, context) => boolean(pathKind(expectString(input(inputs, 0), 'the path of `file/is-directory`', context)) === 'directory'));

  interpreter.defineIn('file', 'remove', 1, (inputs, context) => {
    const path = expectString(input(inputs, 0), 'the path of `file/remove`', context);
    runIo(context, () => removeFile(path, describePath(path)));
    return NOTHING;
  });

  interpreter.defineIn('file', 'list', 1, (inputs, context) => {
    const path = expectString(input(inputs, 0), 'the path of `file/list`', context);
    const names = runIo(context, () => listDirectory(path, describePath(path))).map(string);
    return array(stableSort(names, (left, right) => compareValues(left, right, context.position)));
  });
}
