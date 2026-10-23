import { InvalidUtf8, decodeUtf8, encodeUtf8 } from './utf8.ts';

export type StreamMode = 'read' | 'write' | 'append' | 'read-write';

export const STREAM_BUFFER_BYTES = 64 * 1024;

const NEWLINE = 0x0a;
const CARRIAGE_RETURN = 0x0d;
const EMPTY = new Uint8Array(0);

const MODE_WORDS: Record<StreamMode, string> = { read: 'reading', write: 'writing', append: 'appending', 'read-write': 'reading and writing' };

export class IoFailure {
  readonly message: string;

  constructor(message: string) {
    this.message = message;
  }
}

export interface ByteChannel {
  readonly positioned: boolean;
  read(buffer: Uint8Array, start: number, length: number, position: number | null): number;
  write(bytes: Uint8Array, start: number, length: number, position: number | null): void;
  close(): void;
}

export interface Stream {
  readonly label: string;
  readLine(): string | null;
  readAll(): string;
  write(text: string): void;
  flush(): void;
  close(): void;
}

export class StreamRegistry {
  private readonly open: Stream[];

  constructor() {
    this.open = [];
  }

  get size(): number {
    return this.open.length;
  }

  add(stream: Stream): void {
    this.open.push(stream);
  }

  remove(stream: Stream): void {
    for (let i = 0; i < this.open.length; i++) {
      if (this.open[i] === stream) {
        this.open.splice(i, 1);
        return;
      }
    }
  }

  closeAll(): string[] {
    const failures: string[] = [];
    for (const stream of this.open.slice()) {
      try {
        stream.close();
      } catch (error) {
        if (!(error instanceof IoFailure)) throw error;
        failures.push(error.message);
      }
    }
    this.open.length = 0;
    return failures;
  }
}

export interface ChannelStreamOptions {
  label: string;
  description: string;
  mode: StreamMode;
  channel: ByteChannel;
  standard: boolean;
  registry: StreamRegistry | null;
}

export class ChannelStream implements Stream {
  readonly label: string;
  private readonly description: string;
  private readonly mode: StreamMode;
  private readonly channel: ByteChannel;
  private readonly standard: boolean;
  private readonly registry: StreamRegistry | null;
  private closed: boolean;
  private position: number;
  private input: Uint8Array;
  private inputStart: number;
  private inputEnd: number;
  private output: Uint8Array;
  private outputLength: number;
  private outputPosition: number;

  constructor(options: ChannelStreamOptions) {
    this.label = options.label;
    this.description = options.description;
    this.mode = options.mode;
    this.channel = options.channel;
    this.standard = options.standard;
    this.registry = options.registry;
    this.closed = false;
    this.position = 0;
    this.input = EMPTY;
    this.inputStart = 0;
    this.inputEnd = 0;
    this.output = EMPTY;
    this.outputLength = 0;
    this.outputPosition = 0;
    this.registry?.add(this);
  }

  readLine(): string | null {
    this.checkReadable();
    this.flushOutput();
    let searched = 0;
    while (true) {
      for (let i = this.inputStart + searched; i < this.inputEnd; i++) {
        if (this.input[i] === NEWLINE) {
          const contentEnd = i > this.inputStart && this.input[i - 1] === CARRIAGE_RETURN ? i - 1 : i;
          return this.consume(contentEnd, i + 1);
        }
      }
      searched = this.inputEnd - this.inputStart;
      if (!this.fill()) return searched === 0 ? null : this.consume(this.inputEnd, this.inputEnd);
    }
  }

  readAll(): string {
    this.checkReadable();
    this.flushOutput();
    while (this.fill()) continue;
    return this.consume(this.inputEnd, this.inputEnd);
  }

  write(text: string): void {
    this.checkWritable();
    const bytes = encodeUtf8(text);
    this.inputStart = 0;
    this.inputEnd = 0;
    if (this.outputLength + bytes.length > STREAM_BUFFER_BYTES) this.flushOutput();
    if (bytes.length >= STREAM_BUFFER_BYTES) {
      this.channel.write(bytes, 0, bytes.length, this.at(this.position));
      this.position += bytes.length;
      return;
    }
    if (this.output.length === 0) this.output = new Uint8Array(STREAM_BUFFER_BYTES);
    if (this.outputLength === 0) this.outputPosition = this.position;
    this.output.set(bytes, this.outputLength);
    this.outputLength += bytes.length;
    this.position += bytes.length;
  }

  flush(): void {
    if (this.closed) throw new IoFailure(`cannot flush ${this.description}: the stream is closed`);
    this.flushOutput();
  }

  close(): void {
    if (this.closed) return;
    if (this.standard) {
      this.flushOutput();
      return;
    }
    this.closed = true;
    this.registry?.remove(this);
    try {
      this.flushOutput();
    } finally {
      this.channel.close();
    }
  }

  private checkReadable(): void {
    if (this.closed) throw new IoFailure(`cannot read ${this.description}: the stream is closed`);
    if (this.mode !== 'read' && this.mode !== 'read-write') {
      throw new IoFailure(`cannot read ${this.description}: ${this.standard ? 'it can only be written' : `the stream was opened for ${MODE_WORDS[this.mode]}`}`);
    }
  }

  private checkWritable(): void {
    if (this.closed) throw new IoFailure(`cannot write ${this.description}: the stream is closed`);
    if (this.mode === 'read') throw new IoFailure(`cannot write ${this.description}: ${this.standard ? 'it can only be read' : 'the stream was opened for reading'}`);
  }

  private at(position: number): number | null {
    return this.channel.positioned ? position : null;
  }

  private flushOutput(): void {
    if (this.outputLength === 0) return;
    const length = this.outputLength;
    this.outputLength = 0;
    this.channel.write(this.output, 0, length, this.at(this.outputPosition));
  }

  private fill(): boolean {
    if (this.inputStart > 0) {
      this.input.copyWithin(0, this.inputStart, this.inputEnd);
      this.inputEnd -= this.inputStart;
      this.inputStart = 0;
    }
    if (this.input.length === 0) {
      this.input = new Uint8Array(STREAM_BUFFER_BYTES);
    } else if (this.inputEnd === this.input.length) {
      const grown = new Uint8Array(this.input.length * 2);
      grown.set(this.input.subarray(0, this.inputEnd));
      this.input = grown;
    }
    const count = this.channel.read(this.input, this.inputEnd, this.input.length - this.inputEnd, this.at(this.position + this.inputEnd));
    this.inputEnd += count;
    return count > 0;
  }

  private consume(contentEnd: number, consumedEnd: number): string {
    const start = this.inputStart;
    const startPosition = this.position;
    let text: string | null = null;
    let invalidOffset = 0;
    try {
      text = decodeUtf8(this.input, start, contentEnd);
    } catch (error) {
      if (!(error instanceof InvalidUtf8)) throw error;
      invalidOffset = startPosition + error.offset;
    }
    this.inputStart = consumedEnd;
    this.position += consumedEnd - start;
    if (this.inputStart === this.inputEnd && this.input.length > STREAM_BUFFER_BYTES) {
      this.input = EMPTY;
      this.inputStart = 0;
      this.inputEnd = 0;
    }
    if (text === null) throw new IoFailure(`cannot read ${this.description}: it is not valid UTF-8 text (invalid byte at offset ${invalidOffset})`);
    return text;
  }
}

export class TextOutputStream implements Stream {
  readonly label: string;
  private readonly description: string;
  private readonly sink: (text: string) => void;

  constructor(label: string, description: string, sink: (text: string) => void) {
    this.label = label;
    this.description = description;
    this.sink = sink;
  }

  readLine(): string | null {
    throw this.notReadable();
  }

  readAll(): string {
    throw this.notReadable();
  }

  write(text: string): void {
    this.sink(text);
  }

  flush(): void {}

  close(): void {}

  private notReadable(): IoFailure {
    return new IoFailure(`cannot read ${this.description}: it can only be written`);
  }
}
