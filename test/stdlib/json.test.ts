import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NOTHING, array, boolean, float, formatValue, int, newMap, string, type Value } from '../../src/values.ts';
import { randomNumbers } from '../helpers/random.ts';
import { failure, output, run, runCli } from '../helpers/run.ts';

const bin = fileURLToPath(new URL('../../bin/slopersons.mjs', import.meta.url));

const LITERAL_ESCAPES: Record<string, string> = { '\\': '\\\\', '"': '\\"', '{': '\\{', '}': '\\}', '\n': '\\n', '\t': '\\t', '\r': '\\r' };

function literal(text: string): string {
  return `"${[...text].map((character) => LITERAL_ESCAPES[character] ?? character).join('')}"`;
}

function parseShown(text: string): string {
  const result = run(`${literal(text)} -> json/parse -> show -> io/print-line`);
  if (result.error !== null) throw new Error(`json/parse failed on ${JSON.stringify(text)}: ${result.error.message}`);
  return result.out;
}

function parseFailure(text: string): string {
  const result = run(`${literal(text)} -> json/parse`);
  if (result.error === null) throw new Error(`json/parse accepted ${JSON.stringify(text)}`);
  return result.error.message;
}

function randomJsonValues(seed: number, count: number, withFloats: boolean): unknown[] {
  const next = randomNumbers(seed);
  const alphabet = ['a', 'Z', ' ', '"', '\\', '/', '\n', '\t', '\u0001', '\u001f', '\u007f', 'é', '日', '🎉', '{', '}', ':', ',', '~'];
  const randomText = (): string => Array.from({ length: next(6) }, () => alphabet[next(alphabet.length)]).join('');
  const randomNumber = (): number => (withFloats && next(2) === 0 ? (next(100000) - 50000) / 7 : next(2000000000) - 1000000000);
  const randomValue = (depth: number): unknown => {
    const kind = next(depth > 3 ? 5 : 7);
    if (kind === 0) return null;
    if (kind === 1) return next(2) === 0;
    if (kind === 2) return randomNumber();
    if (kind === 3 || kind === 4) return randomText();
    if (kind === 5) return Array.from({ length: next(4) }, () => randomValue(depth + 1));
    return Object.fromEntries(Array.from({ length: next(4) }, () => [randomText(), randomValue(depth + 1)]));
  };
  return Array.from({ length: count }, () => Object.fromEntries(Array.from({ length: 2 + next(4) }, () => [randomText(), randomValue(1)])));
}

function expected(value: unknown): Value {
  if (value === null) return NOTHING;
  if (typeof value === 'boolean') return boolean(value);
  if (typeof value === 'string') return string(value);
  if (typeof value === 'number') return Number.isInteger(value) ? int(BigInt(value)) : float(value);
  if (Array.isArray(value)) return array(value.map(expected));
  const members = newMap();
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) members.table.set(string(key), expected(item));
  return members;
}

test('json/parse maps objects to hashmaps, arrays to arrays and literals to yes, no and nothing', () => {
  assert.equal(parseShown('{"b": [true, false, null], "a": {}, "c": [], "d": "text"}'), '{"b": [yes no nothing]  "a": {}  "c": []  "d": "text"}\n');
});

test('numbers without a fraction or exponent become exact ints, the rest floats', () => {
  assert.equal(parseShown('[0, -7, 12345678901234567890, -0, 2.5, -0.125, 1E2, 3e-2, 1.5e+3]'), '[0 -7 12345678901234567890 0 2.5 -0.125 100.0 0.03 1500.0]\n');
});

test('string escapes decode to their characters, and a surrogate pair to one character', () => {
  assert.equal(parseShown('"q\\"b\\\\s\\/n\\nr\\rt\\t\\u00e9\\ud83c\\udf89"'), '"q\\"b\\\\s/n\\nr\\rt\\té🎉"\n');
  assert.equal(output(`${literal('"\\b\\f\\u0041"')} -> json/parse -> string/chars -> array/map char/to-int -> io/print-line`), '[8 12 65]\n');
  assert.equal(output(`${literal('"\\ud83c\\udf89"')} -> json/parse -> string/length -> io/print-line`), '1\n');
});

test('whitespace around tokens is allowed and a repeated member name keeps the last value', () => {
  assert.equal(parseShown(' \t\r\n {\n  "a" : 1 ,\n  "b":2,"a":3\n}\n '), '{"a": 3  "b": 2}\n');
});

test('json/parse agrees with the JavaScript parser on random documents', () => {
  const escapeEveryNonAscii = (text: string): string => text.replace(/[\u007f-￿]/g, (unit) => `\\u${unit.charCodeAt(0).toString(16).padStart(4, '0')}`);
  for (const value of randomJsonValues(2026, 150, true)) {
    const shown = `${formatValue(expected(value), 'show')}\n`;
    assert.equal(parseShown(JSON.stringify(value)), shown);
    assert.equal(parseShown(escapeEveryNonAscii(JSON.stringify(value, null, 2))), shown);
  }
});

test('invalid JSON is an error that names the offset and what was expected', () => {
  const cases: [string, string][] = [
    ['', 'invalid JSON at offset 0: expected a value, found the end of the text'],
    ['[1,]', 'invalid JSON at offset 3: expected a value, found `]`'],
    ['[1 2]', 'invalid JSON at offset 3: expected a comma or a closing bracket, found `2`'],
    ['{"a" 1}', 'invalid JSON at offset 5: expected a colon, found `1`'],
    ['{a: 1}', 'invalid JSON at offset 1: expected a member name in double quotes, found `a`'],
    ['{"a": 1,}', 'invalid JSON at offset 8: expected a member name in double quotes, found `}`'],
    ['{"a": 1 "b": 2}', 'invalid JSON at offset 8: expected a comma or a closing brace, found `"`'],
    ['01', 'invalid JSON at offset 1: expected the end of the text, found `1`'],
    ['-', 'invalid JSON at offset 1: expected a digit, found the end of the text'],
    ['1.', 'invalid JSON at offset 2: expected a digit after the decimal point, found the end of the text'],
    ['1e+', 'invalid JSON at offset 3: expected a digit in the exponent, found the end of the text'],
    ['.5', 'invalid JSON at offset 0: expected a value, found `.`'],
    ['+1', 'invalid JSON at offset 0: expected a value, found `+`'],
    ['-+1', 'invalid JSON at offset 1: expected a digit, found `+`'],
    ['tru', 'invalid JSON at offset 3: expected "true", found the end of the text'],
    ['nulL', 'invalid JSON at offset 3: expected "null", found `L`'],
    ['"abc', 'invalid JSON at offset 4: expected a closing quote, found the end of the text'],
    ['"\\x"', 'invalid JSON at offset 2: expected one of " \\ / b f n r t u after the backslash, found `x`'],
    ['"\\u12g4"', 'invalid JSON at offset 5: expected a hexadecimal digit, found `g`'],
    ['"\\ud800"', 'invalid JSON at offset 1: the \\u escape is half of a surrogate pair without its other half, which a string cannot hold'],
    ['"a\\udc00"', 'invalid JSON at offset 2: the \\u escape is half of a surrogate pair without its other half, which a string cannot hold'],
    ['"\\ud800\\u0041"', 'invalid JSON at offset 1: the \\u escape is half of a surrogate pair without its other half, which a string cannot hold'],
    ['1e400', 'invalid JSON at offset 0: the number 1e400 is too large for a float'],
    ['"a\tb"', 'invalid JSON at offset 2: a control character must be escaped inside a string'],
    ['[1] x', 'invalid JSON at offset 4: expected the end of the text, found `x`'],
    ['﻿1', 'invalid JSON at offset 0: expected a value, found `﻿`'],
  ];
  for (const [text, message] of cases) assert.equal(parseFailure(text), message, JSON.stringify(text));
});

test('json/parse errors are runtime errors at the caller, so attempt catches them', () => {
  const error = failure('1 => x\n"[" -> json/parse');
  assert.deepEqual(error.position, { line: 2, col: 5 });
  assert.equal(output('attempt | "[" -> json/parse recover e | e -> error/message -> io/print-line'), 'invalid JSON at offset 1: expected a value, found the end of the text\n');
});

test('json/parse checks its input like any builtin', () => {
  assert.equal(failure('1 -> json/parse').message, 'the input of `json/parse` must be a string, got an int');
  assert.equal(failure('[] -> json/parse').message, 'the input of `json/parse` must be a string, got an array');
  assert.equal(failure('"1" -> json/parse 2').message, '`json/parse` expects 1 argument, got 2');
});

test('the json module looks like every other builtin module', () => {
  assert.equal(runCli('json -> module/names -> io/print-line\njson/parse -> io/print-line\njson/parse => parse\n"[1]" -> parse -> io/print-line').io.out, '["parse" "stringify"]\n<proc json/parse>\n[1]\n');
  assert.equal(output('{"a": 1} => json\njson -> hashmap/at "a" -> io/print-line'), '1\n');
});

test('a failed parse leaves nothing behind for the next one', () => {
  assert.equal(output('attempt | "[1, 2" -> json/parse recover | "failed" -> io/print-line\n"[3]" -> json/parse -> io/print-line'), 'failed\n[3]\n');
});

test('the binary parses nesting thousands of levels deep, and deeper text stops at the call depth limit', () => {
  const directory = mkdtempSync(join(tmpdir(), 'slopersons-'));
  const program = join(directory, 'depth.slop');
  writeFileSync(program, 'io/stdin -> stream/read-all -> json/parse -> array/length -> io/print-line\n');
  const deep = spawnSync(bin, [program], { encoding: 'utf8', input: `${'['.repeat(4000)}${']'.repeat(4000)}` });
  assert.equal(deep.stderr, '');
  assert.equal(deep.stdout, '1\n');
  const tooDeep = spawnSync(bin, [program], { encoding: 'utf8', input: `${'['.repeat(6000)}${']'.repeat(6000)}` });
  assert.equal(tooDeep.stderr, `error: too many nested procedure calls (the limit is 10000)\n  at ${program}:1:29\n`);
  assert.equal(tooDeep.status, 1);
});

test('json/stringify writes compact JSON, keeping member order and exact ints', () => {
  assert.equal(
    output('{"name": "Ada"  "tags": ["a" "b"]  "big": 12345678901234567890  "ok": yes  "no": no  "none": nothing  "nested": {"x": []  "y": {}}} -> json/stringify -> io/print-line'),
    '{"name":"Ada","tags":["a","b"],"big":12345678901234567890,"ok":true,"no":false,"none":null,"nested":{"x":[],"y":{}}}\n',
  );
  assert.equal(output('nothing -> json/stringify -> io/print-line\n"" -> json/stringify -> io/print-line\n-7 -> json/stringify -> io/print-line'), 'null\n""\n-7\n');
});

test('json/stringify escapes strings exactly as JavaScript does', () => {
  let text = '"\\/ é 日 🎉 \u007f  ';
  for (let code = 0; code < 32; code++) text += String.fromCodePoint(code);
  assert.equal(output(`${literal(JSON.stringify(text))} -> json/parse -> json/stringify -> io/print`), JSON.stringify(text));
});

test('json/stringify writes floats with a decimal point, so they read back as floats', () => {
  assert.equal(output('[2.0 -0.0 0.1 -2.5] -> json/stringify -> io/print-line'), '[2.0,-0.0,0.1,-2.5]\n');
  const written = output(`${literal('[1e21, 1e-7, 1.5e300, 0.14285714285714285]')} -> json/parse -> json/stringify -> io/print`);
  assert.equal(written, '[1.0e+21,1.0e-7,1.5e+300,0.14285714285714285]');
  assert.deepEqual(JSON.parse(written), [1e21, 1e-7, 1.5e300, 0.14285714285714285]);
  assert.equal(output(`${literal(written)} -> json/parse -> show -> io/print-line`), '[1.0e+21 1.0e-7 1.5e+300 0.14285714285714285]\n');
});

test('json/parse then json/stringify reproduces what JavaScript writes for the same document', () => {
  for (const value of randomJsonValues(1815, 150, false)) {
    const text = JSON.stringify(value);
    assert.equal(output(`${literal(text)} -> json/parse -> json/stringify -> io/print`), text);
  }
});

test('json/stringify refuses values JSON cannot represent, saying where they are', () => {
  const cases: [string, string][] = [
    ['`x`', '`json/stringify` cannot write a char as JSON'],
    ['"2026-10-24" -> date/parse', '`json/stringify` cannot write a date as JSON'],
    ['"10:30" -> time/parse', '`json/stringify` cannot write a time as JSON'],
    ['"2026-10-24T10:30:00" -> datetime/parse', '`json/stringify` cannot write a datetime as JSON'],
    ['[1] -> array/to-set', '`json/stringify` cannot write a set as JSON'],
    ['(n | n)', '`json/stringify` cannot write a proc as JSON'],
    ['io', '`json/stringify` cannot write a module as JSON'],
    ['io/stdout', '`json/stringify` cannot write a stream as JSON'],
    ['{"items": [1 {"when": ("2026-10-24" -> date/parse)}]}', '`json/stringify` cannot write a date as JSON (at /items/1/when)'],
    ['{"a/b~c": [`x`]}', '`json/stringify` cannot write a char as JSON (at /a~1b~0c/0)'],
    ['{1: "one"}', '`json/stringify` needs string keys to write an object, but found an int key'],
    ['{"scores": {"ada": 1  2: 2}}', '`json/stringify` needs string keys to write an object, but found an int key (at /scores)'],
  ];
  for (const [source, message] of cases) assert.equal(failure(`(${source}) -> json/stringify`).message, message, source);
  assert.equal(failure('attempt | 1 / 0 recover e | e -> json/stringify').message, '`json/stringify` cannot write an error as JSON');
});

test('json/stringify errors are reported at the caller, and the next call starts clean', () => {
  const error = failure('1 => x\n[`c`] -> json/stringify');
  assert.deepEqual(error.position, { line: 2, col: 7 });
  assert.equal(output('attempt | {"a": [`c`]} -> json/stringify recover | "failed" -> io/print-line\n[`c`] => chars\nattempt | {"b": chars} -> json/stringify recover e | e -> error/message -> io/print-line'), 'failed\n`json/stringify` cannot write a char as JSON (at /b/0)\n');
});

test('the binary writes deep nesting, and stops a value that contains itself', () => {
  const directory = mkdtempSync(join(tmpdir(), 'slopersons-'));
  const program = join(directory, 'nesting.slop');
  writeFileSync(program, '[] => deep\n999 -> int/times\n| [deep] =>> deep\ndeep -> json/stringify -> string/length -> io/print-line\n[1] => looped\nlooped -> array/push looped\nlooped -> json/stringify\n');
  const result = spawnSync(bin, [program], { encoding: 'utf8' });
  assert.equal(result.stdout, '2000\n');
  assert.equal(result.stderr, `error: \`json/stringify\` stopped after 1000 levels of nesting; the value is nested too deeply or contains itself\n  at ${program}:7:8\n`);
  assert.equal(result.status, 1);
});
