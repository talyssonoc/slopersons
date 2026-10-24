import { test } from 'node:test';
import assert from 'node:assert/strict';
import { posix } from 'node:path';
import { joinPaths, parentPath } from '../../src/runtime/path.ts';
import { randomNumbers } from '../helpers/random.ts';

test('joinPaths puts one separator between parts, and an absolute part starts over', () => {
  const cases: [string, string[], string][] = [
    ['a', ['b'], 'a/b'],
    ['a/', ['b'], 'a/b'],
    ['a', ['b', 'c.txt'], 'a/b/c.txt'],
    ['', ['b'], 'b'],
    ['a', [''], 'a/'],
    ['a', ['/etc', 'hosts'], '/etc/hosts'],
    ['/', ['tmp'], '/tmp'],
    ['a', ['../b'], 'a/../b'],
    ['dossier', ['été.txt'], 'dossier/été.txt'],
  ];
  for (const [base, parts, joined] of cases) assert.equal(joinPaths(base, parts), joined, `${base} + ${parts.join(', ')}`);
});

test('parentPath agrees with Node path.posix.dirname', () => {
  const fixed = ['', '.', '..', '/', '//', '///', 'a', 'a/', 'a/b', 'a/b/', '/a', '/a/b', '//a', 'a//b', './a', '../a/b.txt', 'é/日本/🎉.txt'];
  const next = randomNumbers(7);
  const pieces = ['a', 'bc', '', '.', '..', '/', '/', 'é', '🎉'];
  const random = Array.from({ length: 2000 }, () => Array.from({ length: next(7) }, () => pieces[next(pieces.length)]).join(''));
  for (const path of [...fixed, ...random]) assert.equal(parentPath(path), posix.dirname(path), JSON.stringify(path));
});
