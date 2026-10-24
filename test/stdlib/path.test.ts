import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runProgram } from '../../src/cli.ts';
import { failure, fakeIo, output } from '../helpers/run.ts';

test('path/join and path/parent build paths from strings', () => {
  assert.equal(output('"data" -> path/join "users" "ada.json" -> io/print-line\n"data" -> path/join "/etc" -> io/print-line\n"data/users/ada.json" -> path/parent -> io/print-line\n"ada.json" -> path/parent -> io/print-line'), 'data/users/ada.json\n/etc\ndata/users\n.\n');
});

test('path functions take strings only', () => {
  assert.equal(failure('1 -> path/join "a"').message, 'the path of `path/join` must be a string, got an int');
  assert.equal(failure('"a" -> path/join "b" 2').message, 'each part given to `path/join` must be a string, got an int');
  assert.equal(failure('"a" -> path/join').message, '`path/join` expects at least 2 arguments, got 1');
  assert.equal(failure('[] -> path/parent').message, 'the path of `path/parent` must be a string, got an array');
});

test('path/this-directory is the working directory when the code has no file, as in the REPL', () => {
  assert.equal(output('path/this-directory -> do -> io/print-line'), `${process.cwd()}\n`);
});

test('path/this-directory is the directory of the file the call is written in, even when another file calls it', () => {
  const directory = mkdtempSync(join(tmpdir(), 'slopersons-path-'));
  mkdirSync(join(directory, 'lib'));
  writeFileSync(join(directory, 'lib', 'where.slop'), 'proc where | path/this-directory -> do\nexport where\n');
  const io = fakeIo();
  const code = runProgram('"./lib/where" -> use => lib\npath/this-directory -> do -> io/print-line\nlib/where -> do -> io/print-line\n', join(directory, 'main.slop'), io);
  assert.equal(io.error, '');
  assert.equal(io.out, `${directory}\n${join(directory, 'lib')}\n`);
  assert.equal(code, 0);
});
