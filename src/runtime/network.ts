import { IoFailure, type ByteChannel } from './stream.ts';

export const DEFAULT_TIMEOUT_MILLISECONDS = 30_000;

export class NetworkFailure {
  readonly reason: string;

  constructor(reason: string) {
    this.reason = reason;
  }
}

export interface Listening {
  listener: number;
  port: number;
}

export interface Connected {
  connection: number;
  host: string;
  port: number;
}

export interface Network {
  listen(host: string, port: number): Listening;
  accept(listener: number): Connected;
  connect(host: string, port: number, timeout: number | null): Connected;
  read(connection: number, buffer: Uint8Array, start: number, length: number, timeout: number | null): number;
  write(connection: number, bytes: Uint8Array, start: number, length: number, timeout: number | null): void;
  closeConnection(connection: number): void;
  closeListener(listener: number): void;
}

function unavailable(): never {
  throw new NetworkFailure('networking is not available here');
}

export const NO_NETWORK: Network = {
  listen: unavailable,
  accept: unavailable,
  connect: unavailable,
  read: unavailable,
  write: unavailable,
  closeConnection: unavailable,
  closeListener: unavailable,
};

export function formatAddress(host: string, port: number): string {
  for (const character of host) {
    if (character === ':') return `[${host}]:${port}`;
  }
  return `${host}:${port}`;
}

export function networkFailure(action: string, description: string, error: unknown): unknown {
  return error instanceof NetworkFailure ? new IoFailure(`cannot ${action} ${description}: ${error.reason}`) : error;
}

export class ConnectionChannel implements ByteChannel {
  readonly positioned: boolean;
  timeout: number | null;
  private readonly network: Network;
  private readonly connection: number;
  private readonly description: string;

  constructor(network: Network, connection: number, description: string) {
    this.positioned = false;
    this.timeout = DEFAULT_TIMEOUT_MILLISECONDS;
    this.network = network;
    this.connection = connection;
    this.description = description;
  }

  read(buffer: Uint8Array, start: number, length: number): number {
    try {
      return this.network.read(this.connection, buffer, start, length, this.timeout);
    } catch (error) {
      throw networkFailure('read', this.description, error);
    }
  }

  write(bytes: Uint8Array, start: number, length: number): void {
    try {
      this.network.write(this.connection, bytes, start, length, this.timeout);
    } catch (error) {
      throw networkFailure('write', this.description, error);
    }
  }

  close(): void {
    try {
      this.network.closeConnection(this.connection);
    } catch (error) {
      throw networkFailure('close', this.description, error);
    }
  }
}

export class Listener {
  readonly address: string;
  readonly port: number;
  private readonly network: Network;
  private readonly listener: number;
  private closed: boolean;

  constructor(network: Network, listening: Listening, host: string) {
    this.network = network;
    this.listener = listening.listener;
    this.port = listening.port;
    this.address = formatAddress(host, listening.port);
    this.closed = false;
  }

  accept(): Connected {
    if (this.closed) throw new IoFailure(`cannot accept a connection on ${this.address}: the listener is closed`);
    try {
      return this.network.accept(this.listener);
    } catch (error) {
      throw networkFailure('accept a connection on', this.address, error);
    }
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    try {
      this.network.closeListener(this.listener);
    } catch (error) {
      throw networkFailure('close the listener on', this.address, error);
    }
  }
}
