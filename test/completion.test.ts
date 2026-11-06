import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CompletionItemKind, type CompletionItem } from 'vscode-languageserver/node';
import { createInterpreter } from '../src/cli.ts';
import { builtinCatalog, completionsAt } from '../src/completion.ts';
import { KEYWORDS } from '../src/lexer.ts';
import { fakeIo } from './helpers/run.ts';

const interpreter = createInterpreter(fakeIo());
const catalog = builtinCatalog(interpreter);

function at(lines: string[], line: number, character = (lines[line] ?? '').length): CompletionItem[] {
  return completionsAt(lines.join('\n'), line, character, { catalog, modules: () => null });
}

function bound(items: CompletionItem[]): string[] {
  return items.filter((item) => item.sortText?.startsWith('0')).map((item) => `${item.label} ${item.detail}`);
}

test('the catalog lists every builtin, with the members of each builtin module', () => {
  assert.deepEqual(
    catalog.map((entry) => entry.name),
    interpreter.builtinNames(),
  );
  const io = catalog.find((entry) => entry.name === 'io');
  assert.equal(io?.module, true);
  assert.deepEqual(io?.members.find((member) => member.name === 'print-line'), { name: 'print-line', procedure: true });
  assert.deepEqual(io?.members.find((member) => member.name === 'stdin'), { name: 'stdin', procedure: false });
  assert.deepEqual(catalog.find((entry) => entry.name === 'show'), { name: 'show', module: false, members: [] });
});

test('names in scope at the cursor are offered while the line is still being typed, inner ones first', () => {
  const items = at(['0 => total', 'proc add-all xs', '| xs -> array/each n', '| | total + '], 3);
  assert.deepEqual(bound(items), ['n parameter', 'xs parameter', 'total variable', 'add-all procedure']);
  assert.equal(items.find((item) => item.label === 'add-all')?.kind, CompletionItemKind.Function);
  assert.equal(items.find((item) => item.label === 'n')?.kind, CompletionItemKind.Variable);
});

test('builtins and keywords follow the names in scope, and a binding hides the builtin it shadows', () => {
  const items = at(['[1] => array', ''], 1);
  assert.deepEqual(bound(items), ['array variable']);
  assert.equal(items.filter((item) => item.label === 'array').length, 1);
  assert.equal(items.find((item) => item.label === 'io')?.kind, CompletionItemKind.Module);
  assert.equal(items.find((item) => item.label === 'show')?.kind, CompletionItemKind.Function);
  assert.deepEqual(
    items.filter((item) => item.kind === CompletionItemKind.Keyword).map((item) => item.label),
    [...KEYWORDS],
  );
  assert.equal(items.length, 1 + (catalog.length - 1) + KEYWORDS.size);
});

test('a binding made after the cursor in the same scope is not offered, a procedure declared later is offered inside a body', () => {
  assert.deepEqual(bound(at(['1 => before', '', '2 => after'], 1)), ['before variable']);
  assert.deepEqual(bound(at(['proc first', '| 1 -> sec', 'proc second', '| 2'], 1)), ['first procedure', 'second procedure']);
});

test('when the line cannot be completed into a statement, the scope of its block is still offered', () => {
  assert.deepEqual(bound(at(['proc f xs', '| 1 + ) tot'], 1)), ['xs parameter', 'f procedure']);
});

test('completing the start of a line that takes a block keeps the rest of the line, so the block stays a lambda body', () => {
  assert.deepEqual(bound(at(['proc f xs', '| xs -> array/map n', '| | n * 2'], 1, 4)), ['xs parameter', 'f procedure']);
});

test('a line that cannot stand where it is, such as a margin deeper than its block allows, is set aside for the top level', () => {
  assert.deepEqual(bound(at(['1 => kept', '| | ke'], 1)), ['kept variable']);
});

test('an inner name hides an outer one with the same name', () => {
  assert.deepEqual(bound(at(['0 => n', '[1] -> array/each n', '| n + '], 2)), ['n parameter']);
});

test('after a builtin module and a slash, its members are offered and replace only what follows the slash', () => {
  const items = at(['"hi" -> io/pri'], 0);
  const printLine = items.find((item) => item.label === 'print-line');
  assert.equal(printLine?.kind, CompletionItemKind.Function);
  assert.equal(printLine?.detail, 'io/print-line');
  assert.deepEqual(printLine?.textEdit, { range: { start: { line: 0, character: 11 }, end: { line: 0, character: 14 } }, newText: 'print-line' });
  assert.equal(items.find((item) => item.label === 'stdin')?.kind, CompletionItemKind.Constant);
  assert.equal(items.length, catalog.find((entry) => entry.name === 'io')?.members.length);
  assert.deepEqual(at(['"m.slop" -> use => geometry', 'geometry/'], 1), []);
});

test('a plain name replaces the word typed so far', () => {
  const items = at(['0 => total', 'tot'], 1);
  assert.deepEqual(items.find((item) => item.label === 'total')?.textEdit, { range: { start: { line: 1, character: 0 }, end: { line: 1, character: 3 } }, newText: 'total' });
});

test('nothing is offered inside a string, a comment, after a division slash or in a number', () => {
  assert.deepEqual(at(['"hello wor'], 0), []);
  assert.deepEqual(at(['"a \\" b {'], 0, 6), []);
  assert.deepEqual(at(['x -> io/print-line ~ note to'], 0), []);
  assert.deepEqual(at(['x /'], 0), []);
  assert.deepEqual(at(['12'], 0), []);
});

test('names are offered inside a string interpolation, a nested string there and a character literal do not end it', () => {
  assert.deepEqual(bound(at(['0 => total', '"sum: {total + '], 1)), ['total variable']);
  assert.deepEqual(bound(at(['0 => total', '"{"a" + `"` + '], 1)), ['total variable']);
  assert.deepEqual(at(['0 => total', '"{total} and '], 1), []);
});

test('with a lexer error elsewhere in the file, builtins and keywords are still offered', () => {
  const items = at(['1 => kept', '[1 2'], 0, 0);
  assert.deepEqual(bound(items), []);
  assert.equal(items.length, catalog.length + KEYWORDS.size);
});
