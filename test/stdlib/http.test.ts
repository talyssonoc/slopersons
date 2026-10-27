import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { failure, output } from '../helpers/run.ts';

function scratchPath(name: string): string {
  const path = join(mkdtempSync(join(tmpdir(), 'slopersons-http-')), name);
  assert.doesNotMatch(path, /["\\{}]/, 'temporary paths go inside slopersons string literals unescaped');
  return path;
}

function readRequest(raw: string | Buffer): string {
  const path = scratchPath('request.txt');
  writeFileSync(path, raw);
  return `"${path}" -> file/open "read" -> http/read-request`;
}

function written(response: string): string {
  const path = scratchPath('response.txt');
  output(`"${path}" -> file/open "write" => out\nout -> http/write-response ${response}\nout -> stream/close`);
  return readFileSync(path, 'utf8');
}

function refusal(raw: string | Buffer): string {
  return failure(readRequest(raw)).message;
}

test('http/read-request reads the method, target, decoded path and query, and headers named in lower case', () => {
  const raw = '\r\nGET /search%20page?q=caf%C3%A9&tag=a&tag=b+c&flag HTTP/1.1\r\nHost: example.com\r\nAccept:  text/html \r\nX-Tag: one\r\nx-tag: two\r\n\r\n';
  assert.equal(
    output(`${readRequest(raw)} -> show -> io/print-line`),
    '{"method": "GET"  "target": "/search%20page?q=caf%C3%A9&tag=a&tag=b+c&flag"  "path": "/search page"  "query": {"q": "café"  "tag": ["a" "b c"]  "flag": ""}  "headers": {"host": "example.com"  "accept": "text/html"  "x-tag": "one, two"}  "body": ""}\n',
  );
});

test('a plus in the path stays a plus; only the query and forms read it as a space', () => {
  assert.equal(output(`${readRequest('GET /a+b%2Bc?x=a+b%2Bc HTTP/1.0\r\n\r\n')} => request\nrequest -> hashmap/at "path" -> io/print-line\nrequest -> hashmap/at "query" -> io/print-line`), '/a+b+c\n{"x": "a b+c"}\n');
});

test('http/read-request reads a body of exactly Content-Length bytes and leaves what follows', () => {
  const raw = 'POST /notes HTTP/1.1\r\nContent-Length: 5\r\n\r\ncafénext';
  assert.equal(output(`${readRequest(raw)} -> hashmap/at "body" -> show -> io/print-line`), '"café"\n');
});

test('http/read-request gives nothing when the connection ends before a request starts', () => {
  assert.equal(output(`${readRequest('')} -> io/print-line\n${readRequest('\r\n\r\n')} -> io/print-line`), 'nothing\nnothing\n');
});

test('http/read-request refuses malformed request lines, with the status a server answers', () => {
  assert.equal(refusal('GET /\r\n\r\n'), 'cannot accept the request (400 Bad Request): the request line must be a method, a target and a version separated by single spaces');
  assert.equal(refusal('GET  / HTTP/1.1\r\n\r\n'), 'cannot accept the request (400 Bad Request): the request line must be a method, a target and a version separated by single spaces');
  assert.equal(refusal('G(T / HTTP/1.1\r\n\r\n'), 'cannot accept the request (400 Bad Request): the request line must be a method, a target and a version separated by single spaces');
  assert.equal(refusal('GET / HTTP/2.0\r\n\r\n'), 'cannot accept the request (505 HTTP Version Not Supported): only HTTP/1.0 and HTTP/1.1 are supported, got HTTP/2.0');
  assert.equal(refusal('GET index.html HTTP/1.1\r\n\r\n'), 'cannot accept the request (400 Bad Request): the target must be a path that starts with /, got "index.html"');
  assert.equal(refusal('GET /%ZZ HTTP/1.1\r\n\r\n'), 'cannot accept the request (400 Bad Request): the target "/%ZZ" is not valid: a % must be followed by two hexadecimal digits');
  assert.equal(refusal('GET /a% HTTP/1.1\r\n\r\n'), 'cannot accept the request (400 Bad Request): the target "/a%" is not valid: a % must be followed by two hexadecimal digits');
  assert.equal(refusal('GET /%FF HTTP/1.1\r\n\r\n'), 'cannot accept the request (400 Bad Request): the target "/%FF" is not valid: the percent-encoded bytes are not valid UTF-8');
});

test('percent-decoding rejects every kind of invalid UTF-8', () => {
  for (const bytes of ['%C0%80', '%E0%80%80', '%ED%A0%80', '%F4%90%80%80', '%C3', '%C3%28', '%80']) {
    assert.match(refusal(`GET /${bytes} HTTP/1.1\r\n\r\n`), /the percent-encoded bytes are not valid UTF-8$/, bytes);
  }
  assert.equal(output(`${readRequest('GET /%F0%9F%91%8D%E6%97%A5%C3%A9a HTTP/1.1\r\n\r\n')} -> hashmap/at "path" -> io/print-line`), '/👍日éa\n');
});

test('http/read-request refuses malformed header lines', () => {
  assert.equal(refusal('GET / HTTP/1.1\r\nNoColon\r\n\r\n'), 'cannot accept the request (400 Bad Request): the header line "NoColon" has no colon');
  assert.equal(refusal('GET / HTTP/1.1\r\nA: 1\r\n  folded\r\n\r\n'), 'cannot accept the request (400 Bad Request): header lines continued on the next line are not supported');
  assert.equal(refusal('GET / HTTP/1.1\r\nBad Name: 1\r\n\r\n'), 'cannot accept the request (400 Bad Request): the header name "Bad Name" is not valid');
  assert.equal(refusal('GET / HTTP/1.1\r\nHost: x\r\n'), 'cannot accept the request (400 Bad Request): the connection ended inside the request head');
});

test('http/read-request refuses bodies it cannot read: no length, a bad length, too short or too long', () => {
  assert.equal(refusal('POST / HTTP/1.1\r\nTransfer-Encoding: chunked\r\n\r\n'), 'cannot accept the request (411 Length Required): bodies sent with Transfer-Encoding are not supported; send a Content-Length instead');
  assert.equal(refusal('POST / HTTP/1.1\r\nContent-Length: -1\r\n\r\n'), 'cannot accept the request (400 Bad Request): the Content-Length "-1" is not a number of bytes');
  assert.equal(refusal('POST / HTTP/1.1\r\nContent-Length: 5\r\nContent-Length: 5\r\n\r\nhello'), 'cannot accept the request (400 Bad Request): the Content-Length "5, 5" is not a number of bytes');
  assert.equal(refusal('POST / HTTP/1.1\r\nContent-Length: 10\r\n\r\nshort'), 'cannot accept the request (400 Bad Request): the connection ended before the 10 bytes the Content-Length announced');
  assert.equal(refusal('POST / HTTP/1.1\r\nContent-Length: 1048577\r\n\r\n'), 'cannot accept the request (413 Content Too Large): the body is longer than 1048576 bytes');
  assert.match(refusal(Buffer.from('POST / HTTP/1.1\r\nContent-Length: 2\r\n\r\n\xff\xff', 'latin1')), /^cannot accept the request \(400 Bad Request\): the body could not be read: cannot read ".*": it is not valid UTF-8 text/);
});

test('http/read-request refuses heads that are too large', () => {
  const headers = Array.from({ length: 101 }, (_unused, index) => `X-${index}: 1\r\n`).join('');
  assert.equal(refusal(`GET / HTTP/1.1\r\n${headers}\r\n`), 'cannot accept the request (431 Request Header Fields Too Large): the request has more than 100 header lines');
  assert.equal(refusal(`GET / HTTP/1.1\r\nX-Big: ${'a'.repeat(17000)}\r\n\r\n`), 'cannot accept the request (431 Request Header Fields Too Large): the request head is longer than 16384 bytes');
  assert.equal(refusal(`${'\r\n'.repeat(8200)}GET / HTTP/1.1\r\n\r\n`), 'cannot accept the request (431 Request Header Fields Too Large): the request head is longer than 16384 bytes');
});

test('http/read-request takes only streams', () => {
  assert.equal(failure('5 -> http/read-request').message, 'the input of `http/read-request` must be a stream, got an int');
});

test('http/write-response writes the status line, the headers, the length in bytes and the body, and always closes the connection', () => {
  assert.equal(
    written('{"status": 201  "headers": {"x-ids": ["1" "2"]  "Content-Length": "999"  "Connection": "keep-alive"}  "body": "héllo"}'),
    'HTTP/1.1 201 Created\r\nx-ids: 1\r\nx-ids: 2\r\ncontent-type: text/plain; charset=utf-8\r\ncontent-length: 6\r\nconnection: close\r\n\r\nhéllo',
  );
});

test('a response needs nothing but defaults: status 200, no headers, an empty body and no content type', () => {
  assert.equal(written('{}'), 'HTTP/1.1 200 OK\r\ncontent-length: 0\r\nconnection: close\r\n\r\n');
});

test('a response keeps its own content type, and an unknown status gets an empty reason', () => {
  assert.equal(written('{"status": 299  "headers": {"Content-Type": "text/csv"}  "body": "a,b"}'), 'HTTP/1.1 299 \r\nContent-Type: text/csv\r\ncontent-length: 3\r\nconnection: close\r\n\r\na,b');
});

test('204 and 304 responses carry no length and no body', () => {
  assert.equal(written('{"status": 204  "body": "ignored"}'), 'HTTP/1.1 204 No Content\r\ncontent-type: text/plain; charset=utf-8\r\nconnection: close\r\n\r\n');
  assert.equal(written('{"status": 304}'), 'HTTP/1.1 304 Not Modified\r\nconnection: close\r\n\r\n');
});

test('http/write-response rejects responses it cannot write', () => {
  const rejected = (response: string): string => failure(`"${scratchPath('response.txt')}" -> file/open "write" -> http/write-response ${response}`).message;
  assert.equal(rejected('"text"'), 'the response must be a hashmap, got a string');
  assert.equal(rejected('{"status": "200"}'), 'the status of the response must be an int, got a string');
  assert.equal(rejected('{"status": 199}'), 'the status of the response must be between 200 and 599, got 199');
  assert.equal(rejected('{"status": 600}'), 'the status of the response must be between 200 and 599, got 600');
  assert.equal(rejected('{"headers": []}'), 'the headers of the response must be a hashmap, got an array');
  assert.equal(rejected('{"body": 5}'), 'the body of the response must be a string, got an int');
  assert.equal(rejected('{"headers": {"x-a": 5}}'), 'the value of the header x-a must be a string or an array of strings, got an int');
  assert.equal(rejected('{"headers": {"x-a": "1\\r\\nset-cookie: stolen=1"}}'), 'the value of the header x-a must not contain a line break');
  assert.equal(rejected('{"headers": {"x a": "1"}}'), 'the header name "x a" is not valid');
  assert.equal(rejected('{"headers": {1: "1"}}'), 'header names must be strings, got an int');
  assert.equal(failure('5 -> http/write-response {}').message, 'the input of `http/write-response` must be a stream, got an int');
});

test('the response helpers build hashmaps with a status, a content type and a body', () => {
  assert.equal(
    output('"hi" -> http/text -> show -> io/print-line\n"<p>" -> http/html -> show -> io/print-line\n{"a": [1 nothing]} -> http/json -> show -> io/print-line\n"/x" -> http/redirect -> show -> io/print-line'),
    [
      '{"status": 200  "headers": {"content-type": "text/plain; charset=utf-8"}  "body": "hi"}',
      '{"status": 200  "headers": {"content-type": "text/html; charset=utf-8"}  "body": "<p>"}',
      '{"status": 200  "headers": {"content-type": "application/json"}  "body": "\\{\\"a\\":[1,null]\\}"}',
      '{"status": 303  "headers": {"location": "/x"}  "body": ""}',
      '',
    ].join('\n'),
  );
  assert.equal(failure('5 -> http/text').message, 'the body of `http/text` must be a string, got an int');
  assert.equal(failure('5 -> http/html').message, 'the body of `http/html` must be a string, got an int');
  assert.equal(failure('5 -> http/redirect').message, 'the location of `http/redirect` must be a string, got an int');
  assert.equal(failure('(date/today -> do) -> http/json').message, '`json/stringify` cannot write a date as JSON');
});

test('http/parse-form decodes fields, turns repeated names into arrays and accepts names without values', () => {
  assert.equal(output('"a=1&b=x+y%26z&a=2&&c&a=3" -> http/parse-form -> io/print-line'), '{"a": ["1" "2" "3"]  "b": "x y&z"  "c": ""}\n');
  assert.equal(output('"" -> http/parse-form -> io/print-line'), '{}\n');
  assert.equal(failure('"a=%2" -> http/parse-form').message, 'the form data is not valid: a % must be followed by two hexadecimal digits');
  assert.equal(failure('5 -> http/parse-form').message, 'the input of `http/parse-form` must be a string, got an int');
});

test('http/escape-html escapes the five characters that are special in HTML', () => {
  assert.equal(output('"<a href=\\"x\\" title=\'y\'>Tom & Jerry</a>" -> http/escape-html -> io/print-line'), '&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;Tom &amp; Jerry&lt;/a&gt;\n');
  assert.equal(failure('5 -> http/escape-html').message, 'the input of `http/escape-html` must be a string, got an int');
});

test('http/cookies reads the Cookie header into a hashmap, unquoting values and keeping the first of a repeated name', () => {
  assert.equal(output('{"headers": {"cookie": "session=abc123; theme=\\"dark\\"; session=other; junk; =x; empty="}} -> http/cookies -> io/print-line'), '{"session": "abc123"  "theme": "dark"  "empty": ""}\n');
  assert.equal(output('{"headers": {}} -> http/cookies -> io/print-line\n{} -> http/cookies -> io/print-line'), '{}\n{}\n');
});

test('http/cookies works on a request read from the wire', () => {
  assert.equal(output(`${readRequest('GET / HTTP/1.1\r\nCookie: a=1; b=2\r\n\r\n')} -> http/cookies -> io/print-line`), '{"a": "1"  "b": "2"}\n');
});

test('http/cookies names what it rejects', () => {
  assert.equal(failure('"x" -> http/cookies').message, 'the input of `http/cookies` must be a request hashmap, got a string');
  assert.equal(failure('{"headers": {"cookie": 1}} -> http/cookies').message, 'the cookie header of the request must be a string, got an int');
});

test('http/set-cookie adds a Set-Cookie header that is HttpOnly, SameSite=Lax and for the whole site unless the options say otherwise', () => {
  assert.equal(output('{} -> http/set-cookie "session" "abc" {} -> io/print-line'), '{"headers": {"set-cookie": ["session=abc; Path=/; HttpOnly; SameSite=Lax"]}}\n');
  assert.equal(
    output('{} -> http/set-cookie "theme" "dark" {"max-age": 3600  "http-only": no  "secure": yes  "same-site": "Strict"  "domain": "example.com"  "path": "/app"} -> hashmap/at "headers" -> io/print-line'),
    '{"set-cookie": ["theme=dark; Path=/app; Domain=example.com; Max-Age=3600; Secure; SameSite=Strict"]}\n',
  );
});

test('http/set-cookie adds to the Set-Cookie lines already there and returns the response', () => {
  assert.equal(output('"ok" -> http/text -> http/set-cookie "a" "1" {} -> http/set-cookie "b" "2" {"max-age": 0} -> hashmap/at "headers" -> hashmap/at "set-cookie" -> io/print-line'), '["a=1; Path=/; HttpOnly; SameSite=Lax" "b=2; Path=/; Max-Age=0; HttpOnly; SameSite=Lax"]\n');
  assert.equal(output('{"headers": {"set-cookie": "a=1"}} -> http/set-cookie "b" "2" {} -> hashmap/at "headers" -> hashmap/at "set-cookie" -> io/print-line'), '["a=1" "b=2; Path=/; HttpOnly; SameSite=Lax"]\n');
});

test('cookies set with http/set-cookie are written as one header line each', () => {
  assert.equal(written('({"status": 204} -> http/set-cookie "a" "1" {} -> http/set-cookie "b" "2" {})'), 'HTTP/1.1 204 No Content\r\nset-cookie: a=1; Path=/; HttpOnly; SameSite=Lax\r\nset-cookie: b=2; Path=/; HttpOnly; SameSite=Lax\r\nconnection: close\r\n\r\n');
});

test('http/set-cookie refuses names, values and options a browser would misread', () => {
  const message = (call: string) => failure(`{} -> http/set-cookie ${call}`).message;
  assert.equal(message('"a b" "x" {}'), 'the cookie name "a b" is not valid');
  for (const value of ['x;y', 'x y', 'x,y', 'x\\\\y', 'x\\"y', 'é']) {
    assert.match(message(`"a" "${value}" {}`), /^the cookie value .* is not valid: it can only hold visible ASCII characters other than double quotes, commas, semicolons and backslashes$/, value);
  }
  assert.equal(message('"a" "x" {"expires": 1}'), '`http/set-cookie` has no option "expires"; it takes "path", "domain", "max-age", "http-only", "secure", "same-site"');
  assert.equal(message('"a" "x" {"same-site": "None"}'), 'a cookie with same-site "None" must also be secure, or browsers refuse it');
  assert.equal(message('"a" "x" {"same-site": "lax"}'), 'the same-site option of `http/set-cookie` must be "Strict", "Lax" or "None", got "lax"');
  assert.equal(message('"a" "x" {"max-age": "1"}'), 'the max-age option of `http/set-cookie` must be an int of seconds, got a string');
  assert.equal(message('"a" "x" {"path": "/;x"}'), 'the path option of `http/set-cookie` cannot contain semicolons or control characters');
  assert.equal(message('"a" "x" {"domain": 1}'), 'the domain option of `http/set-cookie` must be a string, got an int');
  assert.equal(message('"a" "x" {"secure": 1}'), 'the secure option of `http/set-cookie` must be yes or no, got an int');
  assert.equal(message('1 "x" {}'), 'the name of `http/set-cookie` must be a string, got an int');
  assert.equal(message('"a" 1 {}'), 'the value of `http/set-cookie` must be a string, got an int');
  assert.equal(message('"a" "x" []'), 'the options of `http/set-cookie` must be a hashmap, got an array');
  assert.equal(failure('[] -> http/set-cookie "a" "x" {}').message, 'the response given to `http/set-cookie` must be a hashmap, got an array');
  assert.equal(failure('{"headers": []} -> http/set-cookie "a" "x" {}').message, 'the headers of the response given to `http/set-cookie` must be a hashmap, got an array');
});
