import { NetworkFailure, type Connected, type Listening, type Network } from '../../src/runtime/network.ts';

export interface FakeClient {
  host: string;
  port: number;
  input: string;
}

interface OpenConnection {
  input: Uint8Array;
  cursor: number;
  output: number[];
}

export class FakeNetwork implements Network {
  readonly calls: string[];
  readonly failures: Partial<Record<keyof Network, string>>;
  private readonly clients: FakeClient[];
  private readonly connections: OpenConnection[];
  private nextListener: number;

  constructor(clients: FakeClient[] = [], failures: Partial<Record<keyof Network, string>> = {}) {
    this.calls = [];
    this.failures = failures;
    this.clients = [...clients];
    this.connections = [];
    this.nextListener = 1;
  }

  written(connection: number): string {
    return new TextDecoder().decode(Uint8Array.from(this.connections[connection]?.output ?? []));
  }

  listen(host: string, port: number): Listening {
    this.calls.push(`listen ${host} ${port}`);
    this.fail('listen');
    return { listener: this.nextListener++, port: port === 0 ? 40000 : port };
  }

  accept(listener: number): Connected {
    this.calls.push(`accept ${listener}`);
    this.fail('accept');
    const client = this.clients.shift();
    if (client === undefined) throw new Error('the test has no client left to accept');
    return this.open(client.host, client.port, client.input);
  }

  connect(host: string, port: number, timeout: number | null): Connected {
    this.calls.push(`connect ${host} ${port} timeout ${timeout}`);
    this.fail('connect');
    return this.open(host, port, this.clients.shift()?.input ?? '');
  }

  read(connection: number, buffer: Uint8Array, start: number, length: number, timeout: number | null): number {
    this.calls.push(`read ${connection} timeout ${timeout}`);
    this.fail('read');
    const open = this.connection(connection);
    const count = Math.min(length, open.input.length - open.cursor);
    buffer.set(open.input.subarray(open.cursor, open.cursor + count), start);
    open.cursor += count;
    return count;
  }

  write(connection: number, bytes: Uint8Array, start: number, length: number, timeout: number | null): void {
    this.calls.push(`write ${connection} timeout ${timeout}`);
    this.fail('write');
    this.connection(connection).output.push(...bytes.subarray(start, start + length));
  }

  closeConnection(connection: number): void {
    this.calls.push(`close connection ${connection}`);
    this.fail('closeConnection');
  }

  closeListener(listener: number): void {
    this.calls.push(`close listener ${listener}`);
    this.fail('closeListener');
  }

  private open(host: string, port: number, input: string): Connected {
    this.connections.push({ input: new TextEncoder().encode(input), cursor: 0, output: [] });
    return { connection: this.connections.length - 1, host, port };
  }

  private connection(connection: number): OpenConnection {
    const open = this.connections[connection];
    if (open === undefined) throw new Error(`connection ${connection} was never opened`);
    return open;
  }

  private fail(operation: keyof Network): void {
    const reason = this.failures[operation];
    if (reason !== undefined) throw new NetworkFailure(reason);
  }
}
