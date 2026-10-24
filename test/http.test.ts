import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { connect } from 'node:net';
import { fileURLToPath } from 'node:url';
import { listeningPort, openClient, portIsFree, startProgram, within, type RunningProgram } from './helpers/network.ts';

const bin = fileURLToPath(new URL('../bin/slopersons.mjs', import.meta.url));
const TIMEOUT = { timeout: 20_000 };

const SERVER = [
  'proc handle request',
  '| request -> hashmap/at "path" => route',
  '| route = "/fail" ? 1 / 0',
  '| route = "/not-a-response" ? "just text" -> out',
  '| request -> http/json',
  '',
  '"127.0.0.1" -> socket/listen 0 => listener',
  'listener -> socket/port -> io/print-line',
  'listener -> http/serve handle',
  '',
].join('\n');

let program: RunningProgram;
let base = '';

before(async () => {
  program = startProgram([bin], SERVER);
  base = `http://127.0.0.1:${await listeningPort(program)}`;
});

after(() => program.child.kill());

function raw(request: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = connect({ host: '127.0.0.1', port: Number(new URL(base).port) }, () => socket.write(request));
    let response = '';
    socket.setEncoding('utf8');
    socket.on('data', (chunk: string) => {
      response += chunk;
    });
    socket.on('close', () => resolve(response));
    socket.on('error', reject);
  });
}

test('a GET request reaches the handler with its path, its query (repeated names as arrays) and its headers', TIMEOUT, async () => {
  const response = await fetch(`${base}/search%20page?q=caf%C3%A9&tag=a&tag=b`, { headers: { 'X-Test': 'yes' } });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'application/json');
  assert.equal(response.headers.get('connection'), 'close');
  const request = (await response.json()) as Record<string, unknown>;
  assert.equal(request['method'], 'GET');
  assert.equal(request['path'], '/search page');
  assert.deepEqual(request['query'], { q: 'café', tag: ['a', 'b'] });
  assert.equal((request['headers'] as Record<string, string>)['x-test'], 'yes');
  assert.equal(request['body'], '');
});

test('a POST body arrives whole, and the response length counts bytes', TIMEOUT, async () => {
  const response = await fetch(`${base}/notes`, { method: 'POST', body: 'café ☕', headers: { 'content-type': 'text/plain' } });
  const text = await response.text();
  assert.equal(Number(response.headers.get('content-length')), Buffer.byteLength(text));
  assert.equal((JSON.parse(text) as Record<string, unknown>)['body'], 'café ☕');
});

test('a HEAD request gets the headers without the body', TIMEOUT, async () => {
  const response = await raw('HEAD /x HTTP/1.1\r\nHost: test\r\n\r\n');
  assert.match(response, /^HTTP\/1\.1 200 OK\r\ncontent-type: application\/json\r\ncontent-length: \d+\r\nconnection: close\r\n\r\n$/);
});

test('a handler that fails gets a 500 answer, and the error is reported with its position', TIMEOUT, async () => {
  const response = await fetch(`${base}/fail?x=1`);
  assert.equal(response.status, 500);
  assert.equal(await response.text(), 'Internal Server Error\n');
  const notResponse = await fetch(`${base}/not-a-response`);
  assert.equal(notResponse.status, 500);
});

test('a request that is not valid HTTP gets a 400 answer naming the problem', TIMEOUT, async () => {
  assert.equal(
    await raw('NONSENSE\r\n\r\n'),
    'HTTP/1.1 400 Bad Request\r\ncontent-type: text/plain; charset=utf-8\r\ncontent-length: 98\r\nconnection: close\r\n\r\nBad Request: the request line must be a method, a target and a version separated by single spaces\n',
  );
  assert.match(await raw('POST / HTTP/1.1\r\nTransfer-Encoding: chunked\r\n\r\n5\r\nhello\r\n0\r\n\r\n'), /^HTTP\/1\.1 411 Length Required\r\n/);
});

test('a client that connects and sends nothing is dropped after a second, so the next one is not held up for long', TIMEOUT, async () => {
  const idle = await openClient(Number(new URL(base).port));
  const started = Date.now();
  const response = await fetch(`${base}/after-idle`);
  assert.equal(response.status, 200);
  assert.ok(Date.now() - started < 3000, `the request waited ${Date.now() - started} ms`);
  assert.equal((await within(idle.ended, 3000, 'the idle client to be dropped')).data, '');
});

test('a client that disconnects without a request does not stop the server', TIMEOUT, async () => {
  const leaving = await openClient(Number(new URL(base).port));
  leaving.socket.destroy();
  assert.equal((await fetch(`${base}/still-serving`)).status, 200);
});

test('after the requests above, Ctrl-C stops the server with 130 and frees its port, and standard error holds a report for each failing handler', TIMEOUT, async () => {
  program.child.kill('SIGINT');
  const finished = await within(program.finished, 10_000, 'the server to stop');
  assert.equal(finished.code, 130);
  assert.match(finished.stderr, /^error in the handler for GET \/fail\?x=1: division by zero\n {2}at .*program\.slop:3:23\n/);
  assert.match(finished.stderr, /error in the handler for GET \/not-a-response: the response must be a hashmap, got a string\n/);
  assert.equal(await portIsFree(Number(new URL(base).port)), true);
});
