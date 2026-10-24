import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FakeNetwork } from '../helpers/fake-network.ts';
import { run } from '../helpers/run.ts';

function outputWith(network: FakeNetwork, source: string): string {
  const result = run(source, [], network);
  if (result.error !== null) throw new Error(`unexpected error: ${result.error.message}`);
  return result.out;
}

function errorWith(network: FakeNetwork, source: string): string {
  const result = run(source, [], network);
  if (result.error === null) throw new Error(`expected an error, got output: ${JSON.stringify(result.out)}`);
  return result.error.message;
}

test('socket/listen gives a listener that shows its address and reports its port', () => {
  const network = new FakeNetwork();
  const source = '"127.0.0.1" -> socket/listen 8080 => listener\nlistener -> show -> io/print-line\nlistener -> type-of -> io/print-line\nlistener -> socket/port -> io/print-line\n';
  assert.equal(outputWith(network, source), '<listener 127.0.0.1:8080>\nlistener\n8080\n');
  assert.deepEqual(network.calls, ['listen 127.0.0.1 8080']);
});

test('listening on port 0 reports the port the network chose, and IPv6 hosts are bracketed', () => {
  const source = '"::1" -> socket/listen 0 => listener\nlistener -> io/print-line\nlistener -> socket/port -> io/print-line\n';
  assert.equal(outputWith(new FakeNetwork(), source), '<listener [::1]:40000>\n40000\n');
});

test('a listener is equal only to itself', () => {
  const source = '"127.0.0.1" -> socket/listen 1 => first\n"127.0.0.1" -> socket/listen 1 => second\nfirst = first -> io/print-line\nfirst = second -> io/print-line\n';
  assert.equal(outputWith(new FakeNetwork(), source), 'yes\nno\n');
});

test('a listener has no JSON form', () => {
  assert.equal(errorWith(new FakeNetwork(), '"127.0.0.1" -> socket/listen 8080 -> json/stringify'), '`json/stringify` cannot write a listener as JSON');
});

test('socket/listen and socket/connect check the host and the port', () => {
  const network = new FakeNetwork();
  assert.equal(errorWith(network, '8080 -> socket/listen 8080'), 'the host of `socket/listen` must be a string, got an int');
  assert.equal(errorWith(network, '"127.0.0.1" -> socket/listen "80"'), 'the port of `socket/listen` must be an int, got a string');
  assert.equal(errorWith(network, '"127.0.0.1" -> socket/listen -1'), 'the port of `socket/listen` must be between 0 and 65535, got -1');
  assert.equal(errorWith(network, '"127.0.0.1" -> socket/listen 65536'), 'the port of `socket/listen` must be between 0 and 65535, got 65536');
  assert.equal(errorWith(network, '"127.0.0.1" -> socket/connect 0'), 'the port of `socket/connect` must be between 1 and 65535, got 0');
  assert.deepEqual(network.calls, []);
});

test('socket/accept gives a connection stream that reads what the client sent and writes back to it', () => {
  const network = new FakeNetwork([{ host: '10.0.0.7', port: 5000, input: 'hello\r\nrest' }]);
  const source = [
    '"127.0.0.1" -> socket/listen 8080 => listener',
    'listener -> socket/accept => connection',
    'connection -> io/print-line',
    'connection -> type-of -> io/print-line',
    'connection -> stream/read-line => line',
    'connection -> stream/write-line "you said {line}"',
    'connection -> stream/read 2 -> io/print-line',
    'connection -> stream/close',
    '',
  ].join('\n');
  assert.equal(outputWith(network, source), '<stream connection from 10.0.0.7:5000>\nstream\nre\n');
  assert.equal(network.written(0), 'you said hello\n');
  assert.deepEqual(network.calls, ['listen 127.0.0.1 8080', 'accept 1', 'read 0 timeout 30000', 'write 0 timeout 30000', 'close connection 0']);
});

test('socket/set-timeout changes the timeout of later reads and writes, and nothing removes it', () => {
  const network = new FakeNetwork([{ host: '10.0.0.7', port: 5000, input: 'a\nb\n' }]);
  const source = [
    '"127.0.0.1" -> socket/listen 8080 -> socket/accept => connection',
    'connection -> socket/set-timeout 250 -> stream/read-line',
    'connection -> stream/write "x" -> stream/flush',
    'connection -> socket/set-timeout nothing -> stream/write "y" -> stream/flush',
    '',
  ].join('\n');
  outputWith(network, source);
  assert.deepEqual(network.calls.slice(2), ['read 0 timeout 250', 'write 0 timeout 250', 'write 0 timeout null', 'close connection 0']);
});

test('socket/set-timeout takes only connections and a positive int of milliseconds or nothing', () => {
  const network = new FakeNetwork([{ host: '10.0.0.7', port: 5000, input: '' }]);
  const accepted = '"127.0.0.1" -> socket/listen 8080 -> socket/accept => connection\n';
  assert.equal(errorWith(network, 'io/stdout -> socket/set-timeout 5'), 'the input of `socket/set-timeout` must be a connection from `socket/accept` or `socket/connect`, got a stream');
  assert.equal(errorWith(network, `${accepted}connection -> socket/set-timeout 0`), 'the timeout of `socket/set-timeout` must be between 1 and 2147483647 milliseconds, got 0');
  assert.equal(
    errorWith(new FakeNetwork([{ host: '10.0.0.7', port: 5000, input: '' }]), `${accepted}connection -> socket/set-timeout 2147483648`),
    'the timeout of `socket/set-timeout` must be between 1 and 2147483647 milliseconds, got 2147483648',
  );
  assert.equal(
    errorWith(new FakeNetwork([{ host: '10.0.0.7', port: 5000, input: '' }]), `${accepted}connection -> socket/set-timeout 1.5`),
    'the timeout of `socket/set-timeout` must be an int of milliseconds or `nothing`, got a float',
  );
});

test('socket/connect gives a connection stream to the host and port it was given', () => {
  const network = new FakeNetwork([{ host: '', port: 0, input: 'pong\n' }]);
  const source = '"example.com" -> socket/connect 7 => connection\nconnection -> io/print-line\nconnection -> stream/write-line "ping" -> stream/read-line -> io/print-line\n';
  assert.equal(outputWith(network, source), '<stream connection to example.com:7>\npong\n');
  assert.equal(network.written(0), 'ping\n');
  assert.equal(network.calls[0], 'connect example.com 7 timeout 30000');
});

test('socket/close closes a listener once, after which accepting fails without reaching the network', () => {
  const network = new FakeNetwork();
  const source = '"127.0.0.1" -> socket/listen 8080 => listener\nlistener -> socket/close\nlistener -> socket/close\nlistener -> socket/accept\n';
  assert.equal(errorWith(network, source), 'cannot accept a connection on 127.0.0.1:8080: the listener is closed');
  assert.deepEqual(network.calls, ['listen 127.0.0.1 8080', 'close listener 1']);
});

test('socket/close points connections to stream/close', () => {
  const network = new FakeNetwork([{ host: '10.0.0.7', port: 5000, input: '' }]);
  assert.equal(errorWith(network, '"127.0.0.1" -> socket/listen 8080 -> socket/accept -> socket/close'), 'the input of `socket/close` must be a listener, got a stream; close a connection with `stream/close`');
  assert.equal(errorWith(new FakeNetwork(), '5 -> socket/close'), 'the input of `socket/close` must be a listener, got an int');
});

test('network failures become runtime errors that name the operation and the address', () => {
  assert.equal(errorWith(new FakeNetwork([], { listen: 'permission denied' }), '"127.0.0.1" -> socket/listen 80'), 'cannot listen on 127.0.0.1:80: permission denied');
  assert.equal(errorWith(new FakeNetwork([], { connect: 'the connection was refused' }), '"localhost" -> socket/connect 9'), 'cannot connect to localhost:9: the connection was refused');
  assert.equal(
    errorWith(new FakeNetwork([{ host: '10.0.0.7', port: 5000, input: '' }], { read: 'nothing arrived within 30 seconds' }), '"127.0.0.1" -> socket/listen 8080 -> socket/accept -> stream/read-line'),
    'cannot read the connection from 10.0.0.7:5000: nothing arrived within 30 seconds',
  );
  assert.equal(
    errorWith(new FakeNetwork([{ host: '10.0.0.7', port: 5000, input: '' }], { write: 'the other side reset the connection' }), '"127.0.0.1" -> socket/listen 8080 -> socket/accept -> stream/write "x" -> stream/flush'),
    'cannot write the connection from 10.0.0.7:5000: the other side reset the connection',
  );
});

test('a failure can be recovered from, so a server can move on to the next client', () => {
  const network = new FakeNetwork([{ host: '10.0.0.7', port: 5000, input: '' }], { read: 'the other side reset the connection' });
  const source = '"127.0.0.1" -> socket/listen 8080 -> socket/accept => connection\nattempt | connection -> stream/read-line recover problem | problem -> io/print-line\n"still running" -> io/print-line\n';
  assert.equal(outputWith(network, source), 'cannot read the connection from 10.0.0.7:5000: the other side reset the connection\nstill running\n');
});

test('connections left open are flushed and closed when the program ends', () => {
  const network = new FakeNetwork([{ host: '10.0.0.7', port: 5000, input: '' }]);
  outputWith(network, '"127.0.0.1" -> socket/listen 8080 -> socket/accept -> stream/write "bye"\n');
  assert.equal(network.written(0), 'bye');
  assert.deepEqual(network.calls.slice(2), ['write 0 timeout 30000', 'close connection 0']);
});

test('without a network every socket operation fails with a clear message', () => {
  const result = run('"127.0.0.1" -> socket/listen 8080');
  assert.equal(result.error?.message, 'cannot listen on 127.0.0.1:8080: networking is not available here');
});
