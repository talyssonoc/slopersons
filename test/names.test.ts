import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createInterpreter } from '../src/cli.ts';
import { resolveNames } from '../src/names.ts';
import { parse } from '../src/parser.ts';
import { repositoryPrograms } from './helpers/repository-programs.ts';
import { fakeIo } from './helpers/run.ts';

function resolved(...lines: string[]): string[] {
  return resolveNames(parse(lines.join('\n'))).map((occurrence) => {
    const target = occurrence.binding === null ? 'unbound' : `${occurrence.binding.kind} ${occurrence.binding.declaration.line}:${occurrence.binding.declaration.col}`;
    return `${occurrence.name} ${occurrence.position.line}:${occurrence.position.col} ${occurrence.role} -> ${target}`;
  });
}

test('a binding, a procedure and its parameters are declared, read and updated with =>>', () => {
  assert.deepEqual(resolved('0 => total', 'proc add-all xs', '| xs -> array/each n', '| | total + n =>> total', '| total', '[1 2] -> add-all -> io/print-line'), [
    'total 1:6 declaration -> variable 1:6',
    'add-all 2:6 declaration -> procedure 2:6',
    'xs 2:14 declaration -> parameter 2:14',
    'xs 3:3 read -> parameter 2:14',
    'array 3:9 read -> unbound',
    'n 3:20 declaration -> parameter 3:20',
    'total 4:5 read -> variable 1:6',
    'n 4:13 read -> parameter 3:20',
    'total 4:19 write -> variable 1:6',
    'total 5:3 read -> variable 1:6',
    'add-all 6:10 read -> procedure 2:6',
    'io 6:21 read -> unbound',
  ]);
});

test('a second => in the same scope updates the first binding instead of declaring another', () => {
  assert.deepEqual(resolved('1 => x', '2 => x', 'x'), ['x 1:6 declaration -> variable 1:6', 'x 2:6 write -> variable 1:6', 'x 3:1 read -> variable 1:6']);
});

test('a procedure body has its own scope, so => inside it shadows the name outside', () => {
  assert.deepEqual(resolved('1 => x', 'proc f', '| 2 => x', '| x', 'x'), [
    'x 1:6 declaration -> variable 1:6',
    'f 2:6 declaration -> procedure 2:6',
    'x 3:8 declaration -> variable 3:8',
    'x 4:3 read -> variable 3:8',
    'x 5:1 read -> variable 1:6',
  ]);
});

test('a use sees only the declarations before it in its own scope, as when the statements run', () => {
  assert.deepEqual(resolved('x', '1 => x'), ['x 1:1 read -> unbound', 'x 2:6 declaration -> variable 2:6']);
  assert.deepEqual(resolved('1 => x', 'proc f', '| x', '| 2 => x', '| x'), [
    'x 1:6 declaration -> variable 1:6',
    'f 2:6 declaration -> procedure 2:6',
    'x 3:3 read -> variable 1:6',
    'x 4:8 declaration -> variable 4:8',
    'x 5:3 read -> variable 4:8',
  ]);
});

test('an export may come before the declaration it names', () => {
  assert.deepEqual(resolved('export area', 'proc area n', '| n * n'), [
    'area 1:8 read -> procedure 2:6',
    'area 2:6 declaration -> procedure 2:6',
    'n 2:11 declaration -> parameter 2:11',
    'n 3:3 read -> parameter 2:11',
    'n 3:7 read -> parameter 2:11',
  ]);
});

test('conditionals, loops and attempts do not create scopes, and recover declares its error name in the enclosing one', () => {
  assert.deepEqual(resolved('yes ?', '| 1 => x', 'while no', '| 2 => y', 'attempt', '| 1 -> fail', 'recover problem', '| problem', 'x + y => sum'), [
    'x 2:8 declaration -> variable 2:8',
    'y 4:8 declaration -> variable 4:8',
    'fail 6:8 read -> unbound',
    'problem 7:9 declaration -> variable 7:9',
    'problem 8:3 read -> variable 7:9',
    'x 9:1 read -> variable 2:8',
    'y 9:5 read -> variable 4:8',
    'sum 9:10 declaration -> variable 9:10',
  ]);
});

test('a procedure body sees procedures declared after it, and export names refer to their bindings', () => {
  assert.deepEqual(resolved('proc first', '| 1 -> second', 'proc second n', '| n', 'export first second'), [
    'first 1:6 declaration -> procedure 1:6',
    'second 2:8 read -> procedure 3:6',
    'second 3:6 declaration -> procedure 3:6',
    'n 3:13 declaration -> parameter 3:13',
    'n 4:3 read -> parameter 3:13',
    'first 5:8 read -> procedure 1:6',
    'second 5:14 read -> procedure 3:6',
  ]);
});

test('the first part of a qualified name is a read of that name, and names inside interpolation resolve', () => {
  assert.deepEqual(resolved('"m.slop" -> use => geometry', '"area: {2 -> geometry/area}" -> io/print-line'), [
    'use 1:13 read -> unbound',
    'geometry 1:20 declaration -> variable 1:20',
    'geometry 2:14 read -> variable 1:20',
    'io 2:33 read -> unbound',
  ]);
});

test('every name left unbound in the repository programs is a builtin, except the name a golden error expects', () => {
  const builtins = createInterpreter(fakeIo()).builtinNames();
  const programs = repositoryPrograms();
  assert.ok(programs.length >= 30);
  for (const program of programs) {
    const errorFile = program.slice(0, -'.slop'.length) + '.err';
    const expected = existsSync(errorFile) ? /unknown name `([^`]+)`/.exec(readFileSync(errorFile, 'utf8'))?.[1] : undefined;
    const unbound = resolveNames(parse(readFileSync(program, 'utf8')))
      .filter((occurrence) => occurrence.binding === null && !builtins.includes(occurrence.name))
      .map((occurrence) => `${occurrence.name} ${occurrence.role} at ${occurrence.position.line}:${occurrence.position.col}`);
    assert.deepEqual(unbound, expected === undefined ? [] : [unbound[0]], program);
    if (expected !== undefined) assert.match(unbound[0] ?? '', new RegExp(`^${expected} read`), program);
  }
});
