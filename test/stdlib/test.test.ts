import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInterpreter } from '../../src/cli.ts';
import { BANNER, PROMPT, Repl } from '../../src/repl.ts';
import { failure, fakeIo, output, runCli } from '../helpers/run.ts';

test('tests print as they run, failures show the message and where, and a summary closes the run', () => {
  const source = `"math/abs" -> test/describe
| "keeps positive numbers" -> test/it
| | 3 -> math/abs -> test/assert 3
| "flips negative numbers" -> test/it
| | -3 -> math/abs -> test/assert -3
| "inside" -> test/describe
| | "compares structures" -> test/it
| | | [1 {"a": 2}] -> test/assert [1 {"a": 2}]
"outside any group" -> test/it
| "x" -> string/upper -> test/assert "X"`;
  const { code, io } = runCli(source);
  assert.equal(io.out, 'math/abs\n  ✓ keeps positive numbers\n  ✗ flips negative numbers\n    expected -3, got 3\n    at test.slop:5:20\n  inside\n    ✓ compares structures\n✓ outside any group\n\n3 passed, 1 failed\n');
  assert.equal(io.error, '');
  assert.equal(code, 1);
});

test('a run where every test passes exits with 0', () => {
  const { code, io } = runCli('"adds" -> test/it\n| 1 + 1 -> test/assert 2');
  assert.equal(io.out, '✓ adds\n\n1 passed, 0 failed\n');
  assert.equal(code, 0);
});

test('a program that runs no tests prints no summary', () => {
  const { code, io } = runCli('"just a program" -> io/print-line');
  assert.equal(io.out, 'just a program\n');
  assert.equal(code, 0);
});

test('any runtime error fails only the test it happens in', () => {
  const { code, io } = runCli('"divides" -> test/it\n| 1 / 0\n"still runs" -> test/it\n| yes -> test/assert yes');
  assert.equal(io.out, '✗ divides\n  division by zero\n  at test.slop:2:5\n✓ still runs\n\n1 passed, 1 failed\n');
  assert.equal(code, 1);
});

test('test/assert compares with = and returns the actual value', () => {
  assert.equal(output('[1 2] -> test/assert [1 2] -> array/length -> io/print-line'), '2\n');
  assert.equal(failure('1 -> test/assert 1.0').message, 'expected 1.0, got 1');
  assert.equal(failure('"a" -> test/assert `a`').message, 'expected `a`, got "a"');
});

test('test/describe and test/it check their name and body', () => {
  assert.equal(failure('1 -> test/it (| nothing)').message, 'the name of `test/it` must be a string, got an int');
  assert.equal(failure('"x" -> test/it 5').message, 'the body of `test/it` must be a procedure, got an int');
  assert.equal(failure('[] -> test/describe (| nothing)').message, 'the name of `test/describe` must be a string, got an array');
  assert.equal(failure('"x" -> test/describe "body"').message, 'the body of `test/describe` must be a procedure, got a string');
});

test('the summary still comes when the program stops with an error or calls exit, and their exit codes stay', () => {
  const crashed = runCli('"passes" -> test/it (| 1 -> test/assert 1)\n1 / 0');
  assert.equal(crashed.io.out, '✓ passes\n\n1 passed, 0 failed\n');
  assert.equal(crashed.io.error, 'error: division by zero\n  at test.slop:2:3\n');
  assert.equal(crashed.code, 1);
  const exited = runCli('"fails" -> test/it (| 1 -> test/assert 2)\n3 -> exit');
  assert.equal(exited.io.out, '✗ fails\n  expected 2, got 1\n  at test.slop:1:25\n\n0 passed, 1 failed\n');
  assert.equal(exited.code, 3);
});

test('test/describe and test/it return nothing, so the REPL has nothing to echo', () => {
  assert.equal(output('"passes" -> test/it (| yes) -> show -> io/print-line\n"fails" -> test/it (| 1 / 0) -> show -> io/print-line\n"group" -> test/describe (| nothing) -> show -> io/print-line'), '✓ passes\nnothing\n✗ fails\n  division by zero\n  at line 2, column 25\nnothing\ngroup\nnothing\n');
});

test('the test module exposes describe, it and assert, and nothing else', () => {
  assert.equal(runCli('test -> module/names -> io/print-line\ntest -> module/has "at-end" -> io/print-line').io.out, '["describe" "it" "assert"]\nno\n');
});

test('tests run in the REPL report as they go and summarize when the session ends', () => {
  const io = fakeIo(['"fails" -> test/it (| 1 -> test/assert 2)']);
  const code = new Repl(io, createInterpreter(io)).run();
  assert.equal(io.out, `${BANNER}${PROMPT}✗ fails\n  expected 2, got 1\n  at line 1, column 25\n${PROMPT}\n\n0 passed, 1 failed\n`);
  assert.equal(code, 1);
});
