import { test } from 'node:test';
import assert from 'node:assert/strict';
import { failure, output, run, runCli } from '../helpers/run.ts';

test('io/arguments gives the program its arguments as strings, in order', () => {
  const { code, io } = runCli('io/arguments -> do -> io/print-line', [], ['first', '--help', 'two words', '']);
  assert.equal(io.out, '["first" "--help" "two words" ""]\n');
  assert.equal(code, 0);
});

test('io/arguments is empty when the program was given none', () => {
  assert.equal(output('io/arguments -> do -> io/print-line'), '[]\n');
});

test('io/arguments builds a new array on every call, so changing one does not change the next', () => {
  const { io } = runCli('io/arguments -> do -> array/push "extra" -> io/print-line\nio/arguments -> do -> io/print-line', [], ['a']);
  assert.equal(io.out, '["a" "extra"]\n["a"]\n');
});

test('io/stdin, io/stdout and io/stderr are streams', () => {
  assert.equal(output('io/stdin -> type-of -> io/print-line\nio/stdout -> show -> io/print-line\nio/stderr -> io/print-line'), 'stream\n<stream stdout>\n<stream stderr>\n');
});

test('io/read-line and io/stdin -> stream/read-line take turns on the same input', () => {
  const result = run('io/read-line -> do -> io/print-line\nio/stdin -> stream/read-line -> io/print-line\nio/read-line -> do -> io/print-line\nio/stdin -> stream/read-line -> io/print-line', ['one', 'two', 'three']);
  assert.equal(result.out, 'one\ntwo\nthree\nnothing\n');
});

test('writing to io/stdout and io/stderr reaches standard output and standard error in program order', () => {
  const { io } = runCli('"a" -> io/print\nio/stdout -> stream/write-line "b" -> stream/write 1\nio/stderr -> stream/write-line "problem"\n"c" -> io/print-line');
  assert.equal(io.out, 'ab\n1c\n');
  assert.equal(io.error, 'problem\n');
});

test('closing a standard stream leaves it open', () => {
  const result = run('io/stdout -> stream/close\n"still here" -> io/print-line\nio/stdin -> stream/close\nio/read-line -> do -> io/print-line', ['line']);
  assert.equal(result.out, 'still here\nline\n');
});

test('standard input cannot be written and standard output cannot be read', () => {
  assert.equal(failure('io/stdin -> stream/write "x"').message, 'cannot write standard input: it can only be read');
  assert.equal(failure('io/stdout -> stream/read-line').message, 'cannot read standard output: it can only be written');
  assert.equal(failure('io/stderr -> stream/read-all').message, 'cannot read standard error: it can only be written');
});
