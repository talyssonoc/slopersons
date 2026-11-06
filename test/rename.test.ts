import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { TextEdit } from 'vscode-languageserver/node';
import { renameAt, renameTargetAt, type RenameWorkspace } from '../src/rename.ts';

const MAIN = 'file:///work/main.slop';
const GEOMETRY = 'file:///work/lib/geometry.slop';
const SOURCE = ['0 => total', 'proc add-all xs', '| xs -> array/each n', '| | total + n =>> total', '| total', '[1] -> add-all => result'].join('\n');

function workspaceOf(files: Record<string, string>, uri = MAIN): RenameWorkspace {
  return { uri, read: (candidate) => files[candidate] ?? null, files: () => Object.keys(files) };
}

const alone = workspaceOf({});

function edited(source: string, edits: TextEdit[]): string {
  const lines = source.split('\n');
  for (const edit of [...edits].reverse()) {
    const text = lines[edit.range.start.line] ?? '';
    lines[edit.range.start.line] = text.slice(0, edit.range.start.character) + edit.newText + text.slice(edit.range.end.character);
  }
  return lines.join('\n');
}

function renamed(source: string, line: number, character: number, newName: string): string {
  const result = renameAt(source, line, character, newName, alone);
  if ('error' in result) return `error: ${result.error}`;
  assert.deepEqual(Object.keys(result.changes), [MAIN]);
  return edited(source, result.changes[MAIN] ?? []);
}

test('renaming a binding changes its declaration, its reads and its =>> updates, and nothing else', () => {
  assert.equal(renamed(SOURCE, 4, 3, 'sum'), ['0 => sum', 'proc add-all xs', '| xs -> array/each n', '| | sum + n =>> sum', '| sum', '[1] -> add-all => result'].join('\n'));
});

test('a procedure, a parameter and a lambda parameter can be renamed from any of their occurrences', () => {
  assert.equal(renamed(SOURCE, 5, 9, 'sum-all'), SOURCE.replace(/add-all/g, 'sum-all'));
  assert.equal(renamed(SOURCE, 2, 3, 'numbers'), SOURCE.replace(/\bxs\b/g, 'numbers'));
  assert.equal(renamed(SOURCE, 3, 12, 'item'), ['0 => total', 'proc add-all xs', '| xs -> array/each item', '| | total + item =>> total', '| total', '[1] -> add-all => result'].join('\n'));
});

test('a shadowed name renames only the binding under the cursor', () => {
  const source = ['1 => x', 'proc f', '| 2 => x', '| x', 'x'].join('\n');
  assert.equal(renamed(source, 3, 2, 'local'), ['1 => x', 'proc f', '| 2 => local', '| local', 'x'].join('\n'));
});

test('a rename that would make a name refer to something else is refused', () => {
  assert.equal(renamed(SOURCE, 3, 12, 'total'), 'error: renaming `n` to `total` would change what a name refers to in this file');
  assert.equal(renamed('0 => count\ncount -> io/print-line', 0, 6, 'io'), 'error: renaming `count` to `io` would change what a name refers to in this file');
  assert.equal(renamed('proc f n\n| g\nproc g\n| 1', 0, 7, 'g'), 'error: renaming `n` to `g` would change what a name refers to in this file');
});

test('shadowing a builtin that nothing in its scope uses is allowed', () => {
  assert.equal(renamed('[1] -> array/each n\n| n', 0, 18, 'io'), '[1] -> array/each io\n| io');
});

test('a new name that is not a name, or is a keyword, is refused', () => {
  const message = 'is not a name: a name is words of letters and digits joined by `-`, starting with a letter, and not a keyword';
  assert.equal(renamed(SOURCE, 0, 6, 'proc'), `error: \`proc\` ${message}`);
  assert.equal(renamed(SOURCE, 0, 6, 'two words'), `error: \`two words\` ${message}`);
  assert.equal(renamed(SOURCE, 0, 6, '-total'), `error: \`-total\` ${message}`);
  assert.equal(renamed(SOURCE, 0, 6, 'a/b'), `error: \`a/b\` ${message}`);
});

test('builtins, members of builtin modules and names mentioned in a broken statement cannot be renamed', () => {
  assert.deepEqual(renameTargetAt(SOURCE, 2, 10, alone), { error: 'only a name declared in a file of the program can be renamed' });
  assert.deepEqual(renameTargetAt('"x" -> io/print-line', 0, 12, alone), { error: 'only a name declared in a file of the program can be renamed' });
  assert.deepEqual(renameTargetAt('0 => total\ntotal +', 0, 6, alone), { error: 'a statement that does not parse mentions `total`; fix it first' });
});

test('the rename target is the occurrence under the cursor', () => {
  const target = renameTargetAt(SOURCE, 3, 18, alone);
  assert.ok(!('error' in target));
  assert.deepEqual(target.range, { start: { line: 3, character: 18 }, end: { line: 3, character: 23 } });
  assert.equal(target.home.binding.name, 'total');
});

const GEOMETRY_SOURCE = ['proc area r', '| r * r', '3.14 => pi', 'export area pi'].join('\n');
const SHAPES = 'file:///work/shapes.slop';
const SHAPES_SOURCE = ['"./lib/geometry" -> use => geometry', '2 -> geometry/area -> io/print-line', 'geometry/pi'].join('\n');
const OTHER = 'file:///work/other.slop';
const OTHER_SOURCE = ['"./lib/other" -> use => geometry', '2 -> geometry/area'].join('\n');
const NESTED = 'file:///work/app/nested.slop';
const NESTED_SOURCE = ['"../lib/geometry.slop" -> use => shapes', 'shapes/area => area', '1 -> area'].join('\n');

const program = { [GEOMETRY]: GEOMETRY_SOURCE, [SHAPES]: SHAPES_SOURCE, [OTHER]: OTHER_SOURCE, [NESTED]: NESTED_SOURCE };

function renamedEverywhere(files: Record<string, string>, uri: string, line: number, character: number, newName: string): Record<string, string> | string {
  const result = renameAt(files[uri] ?? '', line, character, newName, workspaceOf(files, uri));
  if ('error' in result) return `error: ${result.error}`;
  return Object.fromEntries(Object.entries(result.changes).map(([changed, edits]) => [changed, edited(files[changed] ?? '', edits)]));
}

test('renaming an exported name renames it in the module and in every file that loads that module', () => {
  assert.deepEqual(renamedEverywhere(program, GEOMETRY, 0, 6, 'surface'), {
    [GEOMETRY]: ['proc surface r', '| r * r', '3.14 => pi', 'export surface pi'].join('\n'),
    [SHAPES]: ['"./lib/geometry" -> use => geometry', '2 -> geometry/surface -> io/print-line', 'geometry/pi'].join('\n'),
    [NESTED]: ['"../lib/geometry.slop" -> use => shapes', 'shapes/surface => area', '1 -> area'].join('\n'),
  });
});

test('an exported name can be renamed from a file that loads its module, through the member name', () => {
  assert.deepEqual(renamedEverywhere(program, SHAPES, 1, 16, 'surface'), renamedEverywhere(program, GEOMETRY, 3, 8, 'surface'));
  const target = renameTargetAt(SHAPES_SOURCE, 1, 16, workspaceOf(program, SHAPES));
  assert.ok(!('error' in target));
  assert.deepEqual(target.range, { start: { line: 1, character: 14 }, end: { line: 1, character: 18 } });
});

test('a rename of an exported name that would change a meaning in the module is refused, naming the module file', () => {
  assert.equal(renamedEverywhere(program, SHAPES, 1, 16, 'pi'), 'error: renaming `area` to `pi` would change what a name refers to in /work/lib/geometry.slop');
});

test('a file that loads modules but does not parse stops the rename of an exported name it may use', () => {
  const broken = { ...program, 'file:///work/broken.slop': '"./lib/geometry" -> use => geometry\n2 -> geometry/area +' };
  assert.equal(renamedEverywhere(broken, GEOMETRY, 0, 6, 'surface'), 'error: /work/broken.slop does not parse and may use `/area`; fix it first');
  const unrelated = { ...program, 'file:///work/broken.slop': 'x +' };
  assert.equal(typeof renamedEverywhere(unrelated, GEOMETRY, 0, 6, 'surface'), 'object');
});

test('a member of a module that cannot be read, or that the module does not export, cannot be renamed', () => {
  assert.deepEqual(renameTargetAt(SHAPES_SOURCE, 1, 16, workspaceOf({ [SHAPES]: SHAPES_SOURCE }, SHAPES)), { error: 'cannot read module "./lib/geometry"' });
  assert.deepEqual(renameTargetAt('"./lib/geometry" -> use => geometry\ngeometry/secret', 1, 11, workspaceOf(program, SHAPES)), { error: 'module `geometry` has no exported name `secret`' });
});

test('a name that is not exported is renamed only in its own file, even if another file has a member of that name', () => {
  const files = { ...program, [GEOMETRY]: ['proc area r', '| r * r', '3.14 => pi', 'export pi'].join('\n') };
  const result = renameAt(files[GEOMETRY] ?? '', 0, 6, 'surface', workspaceOf(files, GEOMETRY));
  assert.ok(!('error' in result));
  assert.deepEqual(Object.keys(result.changes), [GEOMETRY]);
});
