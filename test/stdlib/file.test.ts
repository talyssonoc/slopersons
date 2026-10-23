import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterpreter, runProgram } from '../../src/cli.ts';
import { failure, fakeIo, output } from '../helpers/run.ts';

function scratchDirectory(): string {
  return mkdtempSync(join(tmpdir(), 'slopersons-file-'));
}

function literal(path: string): string {
  assert.doesNotMatch(path, /["\\{}]/, 'temporary paths go inside slopersons string literals unescaped');
  return `"${path}"`;
}

test('file/write replaces the content, file/read reads it back, and file/write returns the path', () => {
  const path = join(scratchDirectory(), 'notes.txt');
  writeFileSync(path, 'old content that is longer than the new one');
  assert.equal(output(`${literal(path)} -> file/write "café\\n日本" -> file/read -> show -> io/print-line`), '"café\\n日本"\n');
  assert.equal(readFileSync(path, 'utf8'), 'café\n日本');
});

test('file/append adds to the end, creating the file when it is missing', () => {
  const path = join(scratchDirectory(), 'log.txt');
  output(`${literal(path)} -> file/append "one\\n" -> file/append "two\\n"`);
  assert.equal(readFileSync(path, 'utf8'), 'one\ntwo\n');
});

test('file/write and file/append write the printed form of any value', () => {
  const path = join(scratchDirectory(), 'values.txt');
  output(`${literal(path)} -> file/write [1 "a" \`b\`] -> file/append 2.0`);
  assert.equal(readFileSync(path, 'utf8'), '[1 "a" `b`]2.0');
});

test('a stream opened for reading gives one line at a time and nothing at the end', () => {
  const path = join(scratchDirectory(), 'lines.txt');
  writeFileSync(path, 'first\r\nsecond\nlast');
  const source = `${literal(path)} -> file/open "read" => in
in -> stream/read-line -> io/print-line
in -> stream/read-line -> io/print-line
in -> stream/read-line -> io/print-line
in -> stream/read-line -> io/print-line
in -> stream/close`;
  assert.equal(output(source), 'first\nsecond\nlast\nnothing\n');
});

test('a stream opened for writing truncates the file, chains writes, and has written everything once closed', () => {
  const path = join(scratchDirectory(), 'out.txt');
  writeFileSync(path, 'previous content');
  output(`${literal(path)} -> file/open "write" -> stream/write "a" -> stream/write-line [1 2] -> stream/close`);
  assert.equal(readFileSync(path, 'utf8'), 'a[1 2]\n');
});

test('a stream opened for appending writes after the existing content', () => {
  const path = join(scratchDirectory(), 'append.txt');
  writeFileSync(path, 'kept\n');
  output(`${literal(path)} -> file/open "append" -> stream/write-line "added" -> stream/close`);
  assert.equal(readFileSync(path, 'utf8'), 'kept\nadded\n');
});

test('a read-write stream overwrites at the position its reads reached', () => {
  const path = join(scratchDirectory(), 'both.txt');
  writeFileSync(path, 'name: ada\nrole: tbd\n');
  const source = `${literal(path)} -> file/open "read-write" => both
both -> stream/read-line -> io/print-line
both -> stream/write "role: dev"
both -> stream/read-all -> show -> io/print-line
both -> stream/close`;
  assert.equal(output(source), 'name: ada\n"\\n"\n');
  assert.equal(readFileSync(path, 'utf8'), 'name: ada\nrole: dev\n');
});

test('stream/flush makes written text visible before the stream is closed', () => {
  const path = join(scratchDirectory(), 'flushed.txt');
  const source = `${literal(path)} -> file/open "write" => writer
writer -> stream/write "early"
${literal(path)} -> file/read -> show -> io/print-line
writer -> stream/flush
${literal(path)} -> file/read -> show -> io/print-line
writer -> stream/close`;
  assert.equal(output(source), '""\n"early"\n');
});

test('opening a missing file fails for reading, and for writing into a missing directory', () => {
  const directory = scratchDirectory();
  const missing = join(directory, 'missing.txt');
  assert.equal(failure(`${literal(missing)} -> file/read`).message, `cannot open "${missing}": no such file or directory`);
  assert.equal(failure(`${literal(missing)} -> file/open "read"`).message, `cannot open "${missing}": no such file or directory`);
  assert.equal(failure(`${literal(missing)} -> file/open "read-write"`).message, `cannot open "${missing}": no such file or directory`);
  const nested = join(directory, 'no-such-directory', 'out.txt');
  assert.equal(failure(`${literal(nested)} -> file/write "x"`).message, `cannot open "${nested}": no such file or directory`);
  assert.equal(existsSync(missing), false);
});

test('directories are refused where a file is expected, and files where a directory is', () => {
  const directory = scratchDirectory();
  const file = join(directory, 'plain.txt');
  writeFileSync(file, '');
  assert.equal(failure(`${literal(directory)} -> file/open "read"`).message, `cannot open "${directory}": it is a directory`);
  assert.equal(failure(`${literal(directory)} -> file/write "x"`).message, `cannot open "${directory}": it is a directory`);
  assert.equal(failure(`${literal(directory)} -> file/remove`).message, `cannot remove "${directory}": it is a directory`);
  assert.equal(failure(`${literal(file)} -> file/list`).message, `cannot list "${file}": it is not a directory`);
  assert.equal(existsSync(directory), true);
});

test('file/open names the modes it accepts', () => {
  assert.equal(failure('"x.txt" -> file/open "rw"').message, 'the mode of `file/open` must be "read", "write", "append" or "read-write", got "rw"');
  assert.equal(failure('"x.txt" -> file/open 1').message, 'the mode of `file/open` must be a string, got an int');
  assert.equal(failure('1 -> file/read').message, 'the path of `file/read` must be a string, got an int');
});

test('file failures are runtime errors at the call, so attempt catches them', () => {
  const missing = join(scratchDirectory(), 'missing.txt');
  const error = failure(`1 => x\n${literal(missing)} -> file/read`);
  assert.deepEqual(error.position, { line: 2, col: literal(missing).length + 2 });
  assert.equal(output(`attempt | ${literal(missing)} -> file/read recover e | "caught: {e -> error/message}" -> io/print-line`), `caught: cannot open "${missing}": no such file or directory\n`);
});

test('invalid UTF-8 in a file is an error that names the offset of the bad byte', () => {
  const path = join(scratchDirectory(), 'binary.dat');
  writeFileSync(path, Buffer.from([0x6f, 0x6b, 0x0a, 0xc3, 0x28]));
  assert.equal(failure(`${literal(path)} -> file/read`).message, `cannot read "${path}": it is not valid UTF-8 text (invalid byte at offset 3)`);
});

test('file/exists and file/is-directory tell files, directories and missing paths apart', () => {
  const directory = scratchDirectory();
  const file = join(directory, 'here.txt');
  writeFileSync(file, '');
  const source = [file, directory, join(directory, 'gone')].map((path) => `${literal(path)} -> file/exists -> io/print-line\n${literal(path)} -> file/is-directory -> io/print-line`).join('\n');
  assert.equal(output(source), 'yes\nno\nyes\nyes\nno\nno\n');
});

test('file/remove deletes a file and returns nothing', () => {
  const path = join(scratchDirectory(), 'doomed.txt');
  writeFileSync(path, 'bye');
  assert.equal(output(`${literal(path)} -> file/remove -> io/print-line\n${literal(path)} -> file/exists -> io/print-line`), 'nothing\nno\n');
  assert.equal(failure(`${literal(path)} -> file/remove`).message, `cannot remove "${path}": no such file or directory`);
});

test('file/list gives the names in a directory sorted by code point', () => {
  const directory = scratchDirectory();
  for (const name of ['b.txt', 'é.txt', 'a.txt', 'C.txt']) writeFileSync(join(directory, name), '');
  mkdirSync(join(directory, 'sub'));
  assert.equal(output(`${literal(directory)} -> file/list -> io/print-line`), '["C.txt" "a.txt" "b.txt" "sub" "é.txt"]\n');
});

test('streams print with their path, are equal only to themselves and work as hashmap keys', () => {
  const path = join(scratchDirectory(), 'same.txt');
  writeFileSync(path, '');
  const source = `${literal(path)} -> file/open "read" => a
${literal(path)} -> file/open "read" => b
a -> type-of -> io/print-line
(a = a) -> io/print-line
(a = b) -> io/print-line
{} -> hashmap/put a 1 -> hashmap/put b 2 -> hashmap/length -> io/print-line
a -> show -> io/print-line`;
  assert.equal(output(source), `stream\nyes\nno\n2\n<stream ${path}>\n`);
});

test('a closed stream refuses reads and writes, and closing it again does nothing', () => {
  const path = join(scratchDirectory(), 'closed.txt');
  writeFileSync(path, 'text');
  const prefix = `${literal(path)} -> file/open "read" => in\nin -> stream/close -> io/print-line\nin -> stream/close\n`;
  assert.equal(output(prefix), 'nothing\n');
  assert.equal(failure(`${prefix}in -> stream/read-line`).message, `cannot read "${path}": the stream is closed`);
  assert.equal(failure(`${prefix}in -> stream/read-all`).message, `cannot read "${path}": the stream is closed`);
});

test('a stream refuses the direction its mode does not allow', () => {
  const path = join(scratchDirectory(), 'one-way.txt');
  writeFileSync(path, 'text');
  assert.equal(failure(`${literal(path)} -> file/open "read" -> stream/write "x"`).message, `cannot write "${path}": the stream was opened for reading`);
  assert.equal(failure(`${literal(path)} -> file/open "append" -> stream/read-line`).message, `cannot read "${path}": the stream was opened for appending`);
});

test('stream functions name the stream they expect', () => {
  assert.equal(failure('"x" -> stream/read-line').message, 'the input of `stream/read-line` must be a stream, got a string');
  assert.equal(failure('[1] -> stream/write "x"').message, 'the input of `stream/write` must be a stream, got an array');
});

test('file/read and file/write leave no stream open, and streams the program leaves open are written when it ends', () => {
  const directory = scratchDirectory();
  const kept = join(directory, 'kept.txt');
  const io = fakeIo();
  const interpreter = createInterpreter(io);
  const source = `${literal(join(directory, 'a.txt'))} -> file/write "a" -> file/read
${literal(kept)} -> file/open "write" -> stream/write "never closed"
3 -> exit`;
  const code = runProgram(source, 'test.slop', io, interpreter);
  assert.equal(code, 3);
  assert.equal(interpreter.streams.size, 0);
  assert.equal(readFileSync(kept, 'utf8'), 'never closed');
});
