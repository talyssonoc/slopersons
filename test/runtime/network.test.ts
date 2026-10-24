import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ConnectionChannel, DEFAULT_TIMEOUT_MILLISECONDS, Listener, formatAddress } from '../../src/runtime/network.ts';
import { IoFailure } from '../../src/runtime/stream.ts';
import { FakeNetwork } from '../helpers/fake-network.ts';

test('formatAddress joins a host and a port, bracketing hosts that contain a colon', () => {
  assert.equal(formatAddress('127.0.0.1', 80), '127.0.0.1:80');
  assert.equal(formatAddress('example.com', 443), 'example.com:443');
  assert.equal(formatAddress('::1', 8080), '[::1]:8080');
});

test('a connection channel starts with the default timeout and turns network failures into stream failures', () => {
  const network = new FakeNetwork([], { write: 'the other side reset the connection' });
  const channel = new ConnectionChannel(network, 3, 'the connection from 10.0.0.7:5000');
  assert.equal(channel.timeout, DEFAULT_TIMEOUT_MILLISECONDS);
  assert.equal(DEFAULT_TIMEOUT_MILLISECONDS, 30_000);
  assert.throws(
    () => channel.write(new Uint8Array([1]), 0, 1),
    (error: unknown) => error instanceof IoFailure && error.message === 'cannot write the connection from 10.0.0.7:5000: the other side reset the connection',
  );
});

test('a connection channel lets errors that are not network failures through unchanged', () => {
  const channel = new ConnectionChannel(new FakeNetwork(), 99, 'the connection from 10.0.0.7:5000');
  assert.throws(() => channel.read(new Uint8Array(4), 0, 4), /connection 99 was never opened/);
});

test('a listener remembers its port and stops reaching the network once closed', () => {
  const network = new FakeNetwork();
  const listener = new Listener(network, network.listen('0.0.0.0', 0), '0.0.0.0');
  assert.equal(listener.port, 40000);
  assert.equal(listener.address, '0.0.0.0:40000');
  listener.close();
  listener.close();
  assert.throws(() => listener.accept(), (error: unknown) => error instanceof IoFailure && error.message === 'cannot accept a connection on 0.0.0.0:40000: the listener is closed');
  assert.deepEqual(network.calls, ['listen 0.0.0.0 0', 'close listener 1']);
});
