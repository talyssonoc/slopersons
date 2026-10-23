import { test } from 'node:test';
import assert from 'node:assert/strict';
import { output, runCli } from '../helpers/run.ts';

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
