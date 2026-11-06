import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInterpreter } from '../src/cli.ts';
import { builtinCatalog, completionsAt } from '../src/completion.ts';
import { definitionAt, diagnosticsFor, type DocumentContext } from '../src/lsp.ts';
import { filePath, moduleMembers, moduleUri } from '../src/module-files.ts';
import type { ModuleSource } from '../src/names.ts';
import { parseRecovering } from '../src/parser.ts';
import { fakeIo } from './helpers/run.ts';

const MAIN = 'file:///work/main.slop';
const GEOMETRY = 'file:///work/lib/geometry.slop';
const GEOMETRY_SOURCE = ['3.14 => pi', 'proc area r', '| r * r', 'proc secret | 1', 'export area pi'].join('\n');
const catalog = builtinCatalog(createInterpreter(fakeIo()));

function contextWith(files: Record<string, string>): DocumentContext {
  return { uri: MAIN, catalog, read: (uri) => files[uri] ?? null };
}

const workspace = contextWith({ [GEOMETRY]: GEOMETRY_SOURCE });

test('a module path resolves against the importing file, with .slop added when it is missing', () => {
  assert.equal(moduleUri(MAIN, './lib/geometry'), GEOMETRY);
  assert.equal(moduleUri(MAIN, 'lib/geometry.slop'), GEOMETRY);
  assert.equal(moduleUri('file:///work/app/main.slop', '../lib/geometry'), GEOMETRY);
  assert.equal(moduleUri(MAIN, '/shared/text'), 'file:///shared/text.slop');
  assert.equal(moduleUri('untitled:Untitled-1', './lib/geometry'), null);
  assert.equal(moduleUri('vscode-vfs://github/owner/repository/main.slop', './lib/geometry'), null);
  assert.equal(filePath('file:///work/my%20lib/a.slop'), '/work/my lib/a.slop');
});

test('a module exports the names its export statements list, with their kind and declaration', () => {
  assert.deepEqual(moduleMembers(GEOMETRY, workspace.read), [
    { name: 'area', kind: 'procedure', uri: GEOMETRY, declaration: { line: 2, col: 6 } },
    { name: 'pi', kind: 'variable', uri: GEOMETRY, declaration: { line: 1, col: 9 } },
  ]);
  assert.deepEqual(moduleMembers('file:///work/missing.slop', workspace.read), null);
  assert.deepEqual(moduleMembers(GEOMETRY, contextWith({ [GEOMETRY]: 'export ghost' }).read), [{ name: 'ghost', kind: null, uri: GEOMETRY, declaration: null }]);
});

function messages(context: DocumentContext, ...lines: string[]): string[] {
  return diagnosticsFor(lines.join('\n'), context).map((diagnostic) => `${diagnostic.range.start.line}:${diagnostic.range.start.character}-${diagnostic.range.end.character} ${diagnostic.message}`);
}

test('a member a module does not export is a warning, for a loaded module and for a builtin one', () => {
  assert.deepEqual(messages(workspace, '"./lib/geometry" -> use => geometry', '2 -> geometry/aera -> io/prnt', '2 -> geometry/area -> io/print-line', 'geometry/secret'), [
    '1:14-18 module `geometry` has no exported name `aera`',
    '1:25-29 module `io` has no exported name `prnt`',
    '3:9-15 module `geometry` has no exported name `secret`',
  ]);
});

test('a module file that cannot be read is a warning on its path, and its members are not checked', () => {
  assert.deepEqual(messages(workspace, '"./lib/missing" -> use => missing', 'missing/anything'), ['0:0-15 cannot read module "./lib/missing" (looked for /work/lib/missing.slop)']);
});

test('only a literal path given to the builtin use binds a module; a binding that is not a module is not checked', () => {
  assert.deepEqual(messages(workspace, 'proc use path | path', '"./lib/geometry" -> use => geometry', 'geometry/aera'), []);
  assert.deepEqual(messages(workspace, '"./lib/" => folder', '"{folder}geometry" -> use => geometry', 'geometry/aera'), []);
  assert.deepEqual(messages(workspace, '[1] => io', 'io/prnt'), []);
});

test('each => right after use binds the module, a => after another step does not', () => {
  assert.deepEqual(messages(workspace, '"./lib/geometry" -> use => geometry => shapes', 'shapes/aera'), ['1:7-11 module `shapes` has no exported name `aera`']);
  assert.deepEqual(messages(workspace, '"./lib/geometry" -> use => geometry -> module/names => names', 'names/aera'), []);
});

test('a builtin module name that appears in a statement that does not parse is not checked, since that statement may bind it', () => {
  assert.deepEqual(messages(workspace, '[1] + => io', 'io/prnt'), ['0:6-7 expected a value, found `=>`']);
});

test('each module file is read once per check, however many names reach into it', () => {
  const reads: string[] = [];
  const counting: DocumentContext = { uri: MAIN, catalog, read: (uri) => (reads.push(uri), uri === GEOMETRY ? GEOMETRY_SOURCE : null) };
  diagnosticsFor('"./lib/geometry" -> use => geometry\ngeometry/area\ngeometry/pi\ngeometry/aera', counting);
  assert.deepEqual(reads, [GEOMETRY]);
});

const MAIN_SOURCE = ['"./lib/geometry" -> use => geometry', '2 -> geometry/area => size', 'geometry/pi'].join('\n');

test('go to definition on a module member opens the module at its declaration, and on the path opens the file', () => {
  assert.deepEqual(definitionAt(MAIN_SOURCE, 1, 15, workspace), { uri: GEOMETRY, range: { start: { line: 1, character: 5 }, end: { line: 1, character: 9 } } });
  assert.deepEqual(definitionAt(MAIN_SOURCE, 2, 10, workspace), { uri: GEOMETRY, range: { start: { line: 0, character: 8 }, end: { line: 0, character: 10 } } });
  assert.deepEqual(definitionAt(MAIN_SOURCE, 1, 6, workspace), { uri: MAIN, range: { start: { line: 0, character: 27 }, end: { line: 0, character: 35 } } });
  assert.deepEqual(definitionAt(MAIN_SOURCE, 0, 3, workspace), { uri: GEOMETRY, range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } } });
});

test('go to definition finds nothing for an unexported member, a builtin member or a module that cannot be read', () => {
  assert.equal(definitionAt('"./lib/geometry" -> use => geometry\ngeometry/secret', 1, 10, workspace), null);
  assert.equal(definitionAt('"x" -> io/print-line', 0, 12, workspace), null);
  assert.equal(definitionAt(MAIN_SOURCE, 1, 15, contextWith({})), null);
  assert.equal(definitionAt(MAIN_SOURCE, 0, 3, contextWith({})), null);
});

function memberLabels(context: DocumentContext, ...lines: string[]): string[] {
  const line = lines.length - 1;
  const modules = (module: ModuleSource) => {
    const uri = moduleUri(context.uri, module.path);
    return uri === null ? null : moduleMembers(uri, context.read);
  };
  return completionsAt(lines.join('\n'), line, (lines[line] ?? '').length, { catalog, modules }).map((item) => `${item.label} ${item.detail}`);
}

test('after a loaded module and a slash, its exports are offered; after a name that is not a module, nothing', () => {
  assert.deepEqual(memberLabels(workspace, '"./lib/geometry" -> use => geometry', '2 -> geometry/'), ['area geometry/area', 'pi geometry/pi']);
  assert.deepEqual(memberLabels(workspace, '[1] => array', 'array/'), []);
  assert.ok(memberLabels(workspace, 'io/').includes('print-line io/print-line'));
});

test('a module that does not parse still exports what its other statements declare', () => {
  const broken = contextWith({ [GEOMETRY]: 'proc area r\n| r * r\nproc broken +\nexport area' });
  assert.deepEqual(
    moduleMembers(GEOMETRY, broken.read)?.map((member) => member.name),
    ['area'],
  );
  assert.equal(parseRecovering('proc broken +').errors.length, 1);
});
