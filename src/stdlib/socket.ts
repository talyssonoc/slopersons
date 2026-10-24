import { runtimeError } from '../errors.ts';
import type { CallContext, Interpreter } from '../interpreter.ts';
import { ConnectionChannel, DEFAULT_TIMEOUT_MILLISECONDS, Listener, formatAddress, networkFailure, type Connected } from '../runtime/network.ts';
import { ChannelStream } from '../runtime/stream.ts';
import { NOTHING, describeType, int, listenerValue, streamValue, type Value } from '../values.ts';
import { expectInt, expectString, input, runIo } from './core.ts';

const LONGEST_TIMEOUT_MILLISECONDS = 2_147_483_647n;

function expectPort(value: Value, lowest: bigint, what: string, context: CallContext): number {
  const port = expectInt(value, what, context);
  if (port < lowest || port > 65535n) throw runtimeError(`${what} must be between ${lowest} and 65535, got ${port}`, context.position);
  return Number(port);
}

function expectListener(value: Value, what: string, context: CallContext): Listener {
  if (value.type !== 'listener') throw runtimeError(`${what} must be a listener, got ${describeType(value)}`, context.position);
  return value.listener;
}

function expectConnection(value: Value, what: string, context: CallContext): ConnectionChannel {
  if (value.type === 'stream' && value.stream instanceof ChannelStream && value.stream.channel instanceof ConnectionChannel) return value.stream.channel;
  throw runtimeError(`${what} must be a connection from \`socket/accept\` or \`socket/connect\`, got ${describeType(value)}`, context.position);
}

function expectTimeout(value: Value, context: CallContext): number | null {
  if (value.type === 'nothing') return null;
  if (value.type !== 'int') throw runtimeError(`the timeout of \`socket/set-timeout\` must be an int of milliseconds or \`nothing\`, got ${describeType(value)}`, context.position);
  if (value.value < 1n || value.value > LONGEST_TIMEOUT_MILLISECONDS) {
    throw runtimeError(`the timeout of \`socket/set-timeout\` must be between 1 and ${LONGEST_TIMEOUT_MILLISECONDS} milliseconds, got ${value.value}`, context.position);
  }
  return Number(value.value);
}

function connectionStream(context: CallContext, connected: Connected, direction: 'from' | 'to'): Value {
  const label = `connection ${direction} ${formatAddress(connected.host, connected.port)}`;
  const channel = new ConnectionChannel(context.interpreter.network, connected.connection, `the ${label}`);
  return streamValue(new ChannelStream({ label, description: `the ${label}`, mode: 'read-write', channel, standard: false, registry: context.interpreter.streams }));
}

export function registerSocket(interpreter: Interpreter): void {
  interpreter.defineIn('socket', 'listen', 2, (inputs, context) => {
    const host = expectString(input(inputs, 0), 'the host of `socket/listen`', context);
    const port = expectPort(input(inputs, 1), 0n, 'the port of `socket/listen`', context);
    const network = context.interpreter.network;
    return runIo(context, () => {
      try {
        return listenerValue(new Listener(network, network.listen(host, port), host));
      } catch (error) {
        throw networkFailure('listen on', formatAddress(host, port), error);
      }
    });
  });

  interpreter.defineIn('socket', 'accept', 1, (inputs, context) => {
    const listener = expectListener(input(inputs, 0), 'the input of `socket/accept`', context);
    return runIo(context, () => connectionStream(context, listener.accept(), 'from'));
  });

  interpreter.defineIn('socket', 'connect', 2, (inputs, context) => {
    const host = expectString(input(inputs, 0), 'the host of `socket/connect`', context);
    const port = expectPort(input(inputs, 1), 1n, 'the port of `socket/connect`', context);
    const network = context.interpreter.network;
    return runIo(context, () => {
      let connected: Connected;
      try {
        connected = network.connect(host, port, DEFAULT_TIMEOUT_MILLISECONDS);
      } catch (error) {
        throw networkFailure('connect to', formatAddress(host, port), error);
      }
      return connectionStream(context, connected, 'to');
    });
  });

  interpreter.defineIn('socket', 'port', 1, (inputs, context) => int(BigInt(expectListener(input(inputs, 0), 'the input of `socket/port`', context).port)));

  interpreter.defineIn('socket', 'set-timeout', 2, (inputs, context) => {
    const channel = expectConnection(input(inputs, 0), 'the input of `socket/set-timeout`', context);
    channel.timeout = expectTimeout(input(inputs, 1), context);
    return input(inputs, 0);
  });

  interpreter.defineIn('socket', 'close', 1, (inputs, context) => {
    const value = input(inputs, 0);
    if (value.type === 'stream') throw runtimeError('the input of `socket/close` must be a listener, got a stream; close a connection with `stream/close`', context.position);
    const listener = expectListener(value, 'the input of `socket/close`', context);
    runIo(context, () => listener.close());
    return NOTHING;
  });
}
