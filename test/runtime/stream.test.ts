import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ChannelStream, IoFailure, STREAM_BUFFER_BYTES, StreamRegistry, TextOutputStream, type ByteChannel, type StreamMode } from '../../src/runtime/stream.ts';

class MemoryChannel implements ByteChannel {
  readonly positioned: boolean;
  bytes: number[];
  cursor: number;
  writeCalls: number;
  closed: boolean;
  private readonly chunk: number;
  private readonly appending: boolean;

  constructor(content: string | number[], options: { positioned?: boolean; chunk?: number; appending?: boolean } = {}) {
    this.bytes = typeof content === 'string' ? [...new TextEncoder().encode(content)] : content;
    this.positioned = options.positioned ?? false;
    this.chunk = options.chunk ?? Number.MAX_SAFE_INTEGER;
    this.appending = options.appending ?? false;
    this.cursor = 0;
    this.writeCalls = 0;
    this.closed = false;
  }

  read(buffer: Uint8Array, start: number, length: number, position: number | null): number {
    const from = position ?? this.cursor;
    const count = Math.max(0, Math.min(length, this.chunk, this.bytes.length - from));
    for (let i = 0; i < count; i++) buffer[start + i] = this.bytes[from + i] ?? 0;
    if (position === null) this.cursor += count;
    return count;
  }

  write(source: Uint8Array, start: number, length: number, position: number | null): void {
    this.writeCalls += 1;
    const at = this.appending ? this.bytes.length : (position ?? this.cursor);
    for (let i = 0; i < length; i++) this.bytes[at + i] = source[start + i] ?? 0;
    if (position === null && !this.appending) this.cursor += length;
  }

  close(): void {
    this.closed = true;
  }

  text(): string {
    return new TextDecoder().decode(Uint8Array.from(this.bytes));
  }
}

function stream(channel: ByteChannel, mode: StreamMode, registry: StreamRegistry | null = null, standard = false): ChannelStream {
  return new ChannelStream({ label: 'notes.txt', description: standard ? 'standard input' : '"notes.txt"', mode, channel, standard, registry });
}

function failureMessage(action: () => unknown): string {
  try {
    action();
  } catch (error) {
    if (error instanceof IoFailure) return error.message;
    throw error;
  }
  throw new Error('expected an IoFailure');
}

function readLines(reader: ChannelStream): (string | null)[] {
  const lines: (string | null)[] = [];
  let line: string | null;
  do {
    line = reader.readLine();
    lines.push(line);
  } while (line !== null);
  return lines;
}

test('readLine splits at \\n and \\r\\n, keeps a last line without a break, and gives null at the end, whatever the read size', () => {
  for (const chunk of [1, 2, 3, 5, 64]) {
    const reader = stream(new MemoryChannel('café\r\n日本\n\n🎉 end', { chunk }), 'read');
    assert.deepEqual(readLines(reader), ['café', '日本', '', '🎉 end', null], `chunk ${chunk}`);
  }
});

test('readLine returns lines longer than the read buffer whole', () => {
  const long = 'x'.repeat(STREAM_BUFFER_BYTES * 3 + 7);
  const reader = stream(new MemoryChannel(`${long}\nshort\n`), 'read');
  assert.equal(reader.readLine(), long);
  assert.equal(reader.readLine(), 'short');
  assert.equal(reader.readLine(), null);
});

test('readAll returns the rest of the input exactly, after any lines already read', () => {
  const reader = stream(new MemoryChannel('first\nsecond\r\nno newline at the end', { chunk: 4 }), 'read');
  assert.equal(reader.readLine(), 'first');
  assert.equal(reader.readAll(), 'second\r\nno newline at the end');
  assert.equal(reader.readAll(), '');
  assert.equal(reader.readLine(), null);
});

test('read takes exactly the bytes asked for across several reads, fewer at the end, and null once nothing is left', () => {
  for (const chunk of [1, 3, 64]) {
    const reader = stream(new MemoryChannel('héllo world', { chunk }), 'read');
    assert.equal(reader.read(6), 'héllo', `chunk ${chunk}`);
    assert.equal(reader.read(0), '');
    assert.equal(reader.read(100), ' world');
    assert.equal(reader.read(1), null);
    assert.equal(reader.read(0), '');
  }
});

test('read counts bytes, so stopping inside a character is invalid UTF-8', () => {
  const reader = stream(new MemoryChannel('é!'), 'read');
  assert.equal(failureMessage(() => reader.read(1)), 'cannot read "notes.txt": it is not valid UTF-8 text (invalid byte at offset 0)');
});

test('read continues where readLine stopped and readLine continues after it', () => {
  const reader = stream(new MemoryChannel('Content-Length: 4\r\n\r\nbodynext\n', { chunk: 5 }), 'read');
  assert.equal(reader.readLine(), 'Content-Length: 4');
  assert.equal(reader.readLine(), '');
  assert.equal(reader.read(4), 'body');
  assert.equal(reader.readLine(), 'next');
});

test('invalid UTF-8 fails with the offset of the bad byte, and reading continues after that line', () => {
  const bytes = [...new TextEncoder().encode('ok\n'), 0x61, 0xff, 0x0a, ...new TextEncoder().encode('next\n')];
  const reader = stream(new MemoryChannel(bytes), 'read');
  assert.equal(reader.readLine(), 'ok');
  assert.equal(failureMessage(() => reader.readLine()), 'cannot read "notes.txt": it is not valid UTF-8 text (invalid byte at offset 4)');
  assert.equal(reader.readLine(), 'next');
});

test('writes stay in the buffer until it fills, the stream is flushed, or it is closed', () => {
  const channel = new MemoryChannel('');
  const writer = stream(channel, 'write');
  writer.write('a');
  writer.write('é\n');
  assert.equal(channel.writeCalls, 0);
  writer.flush();
  assert.equal(channel.writeCalls, 1);
  assert.equal(channel.text(), 'aé\n');
  writer.write('b');
  writer.close();
  assert.equal(channel.text(), 'aé\nb');
  assert.equal(channel.closed, true);
});

test('a write larger than the buffer goes straight through, after what was already buffered', () => {
  const channel = new MemoryChannel('');
  const writer = stream(channel, 'write');
  const large = 'y'.repeat(STREAM_BUFFER_BYTES + 1);
  writer.write('start ');
  writer.write(large);
  assert.equal(channel.writeCalls, 2);
  assert.equal(channel.text(), `start ${large}`);
  writer.write('x'.repeat(STREAM_BUFFER_BYTES - 1));
  writer.write('zz');
  assert.equal(channel.writeCalls, 3);
});

test('read-write streams share one position: writes overwrite at it and reads continue after them', () => {
  const channel = new MemoryChannel('one\ntwo\nthree\n', { positioned: true });
  const both = stream(channel, 'read-write');
  assert.equal(both.readLine(), 'one');
  both.write('TWO');
  assert.equal(both.readLine(), '');
  assert.equal(both.readLine(), 'three');
  both.write('four\n');
  assert.equal(both.readLine(), null);
  both.close();
  assert.equal(channel.text(), 'one\nTWO\nthree\nfour\n');
});

test('a read on a read-write stream sees what was written before it', () => {
  const channel = new MemoryChannel('abc\ndef\n', { positioned: true });
  const both = stream(channel, 'read-write');
  both.write('X');
  assert.equal(both.readLine(), 'bc');
  assert.equal(channel.text(), 'Xbc\ndef\n');
});

test('append streams write at the end of what is already there', () => {
  const channel = new MemoryChannel('old\n', { appending: true });
  const appender = stream(channel, 'append');
  appender.write('new\n');
  appender.close();
  assert.equal(channel.text(), 'old\nnew\n');
});

test('a stream refuses the direction its mode does not allow', () => {
  assert.equal(failureMessage(() => stream(new MemoryChannel(''), 'write').readLine()), 'cannot read "notes.txt": the stream was opened for writing');
  assert.equal(failureMessage(() => stream(new MemoryChannel(''), 'append').readAll()), 'cannot read "notes.txt": the stream was opened for appending');
  assert.equal(failureMessage(() => stream(new MemoryChannel(''), 'read').write('x')), 'cannot write "notes.txt": the stream was opened for reading');
  assert.equal(failureMessage(() => stream(new MemoryChannel(''), 'read', null, true).write('x')), 'cannot write standard input: it can only be read');
});

test('a closed stream refuses reads, writes and flushes, and closing it again does nothing', () => {
  const channel = new MemoryChannel('text\n');
  const closed = stream(channel, 'read-write');
  closed.close();
  closed.close();
  assert.equal(channel.closed, true);
  assert.equal(failureMessage(() => closed.readLine()), 'cannot read "notes.txt": the stream is closed');
  assert.equal(failureMessage(() => closed.write('x')), 'cannot write "notes.txt": the stream is closed');
  assert.equal(failureMessage(() => closed.flush()), 'cannot flush "notes.txt": the stream is closed');
});

test('closing a standard stream flushes it and leaves it open', () => {
  const channel = new MemoryChannel('one\ntwo\n');
  const input = stream(channel, 'read', null, true);
  assert.equal(input.readLine(), 'one');
  input.close();
  assert.equal(channel.closed, false);
  assert.equal(input.readLine(), 'two');
});

test('the registry tracks open streams and closeAll flushes them, reporting failures without stopping', () => {
  const registry = new StreamRegistry();
  const good = new MemoryChannel('');
  const failing: ByteChannel = {
    positioned: false,
    read: () => 0,
    write: () => {
      throw new IoFailure('cannot write "full.txt": no space left on the device');
    },
    close: () => {},
  };
  const first = stream(good, 'write', registry);
  const second = stream(failing, 'write', registry);
  const third = stream(new MemoryChannel(''), 'read', registry);
  assert.equal(registry.size, 3);
  third.close();
  assert.equal(registry.size, 2);
  first.write('kept');
  second.write('lost');
  assert.deepEqual(registry.closeAll(), ['cannot write "full.txt": no space left on the device']);
  assert.equal(registry.size, 0);
  assert.equal(good.text(), 'kept');
  assert.equal(good.closed, true);
});

class DuplexChannel implements ByteChannel {
  readonly positioned = false;
  readonly input: number[];
  readonly output: number[];
  private cursor: number;

  constructor(input: string | number[]) {
    this.input = typeof input === 'string' ? [...new TextEncoder().encode(input)] : input;
    this.output = [];
    this.cursor = 0;
  }

  read(buffer: Uint8Array, start: number, length: number): number {
    const count = Math.min(length, this.input.length - this.cursor);
    for (let i = 0; i < count; i++) buffer[start + i] = this.input[this.cursor + i] ?? 0;
    this.cursor += count;
    return count;
  }

  write(source: Uint8Array, start: number, length: number): void {
    for (let i = 0; i < length; i++) this.output.push(source[start + i] ?? 0);
  }

  close(): void {}
}

test('on a stream without positions, like a connection, writing keeps the input already read ahead', () => {
  const channel = new DuplexChannel('first\nsecond\n');
  const connection = stream(channel, 'read-write');
  assert.equal(connection.readLine(), 'first');
  connection.write('got first\n');
  assert.equal(connection.readLine(), 'second');
  assert.equal(new TextDecoder().decode(Uint8Array.from(channel.output)), 'got first\n');
});

test('on a stream without positions, the offset of invalid UTF-8 counts only the bytes read', () => {
  const connection = stream(new DuplexChannel([...new TextEncoder().encode('ok\n'), 0xff, 0x0a]), 'read-write');
  assert.equal(connection.readLine(), 'ok');
  connection.write('a reply that is much longer than what was read');
  assert.equal(failureMessage(() => connection.readLine()), 'cannot read "notes.txt": it is not valid UTF-8 text (invalid byte at offset 3)');
});

test('a text output stream writes straight through and cannot be read or closed', () => {
  const written: string[] = [];
  const output = new TextOutputStream('stdout', 'standard output', (text) => written.push(text));
  output.write('a');
  output.close();
  output.write('b');
  assert.deepEqual(written, ['a', 'b']);
  assert.equal(failureMessage(() => output.readLine()), 'cannot read standard output: it can only be written');
  assert.equal(failureMessage(() => output.read()), 'cannot read standard output: it can only be written');
});
