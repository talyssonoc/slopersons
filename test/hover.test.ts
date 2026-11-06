import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseBuiltinDocs } from '../src/builtin-docs.ts';
import { createInterpreter } from '../src/cli.ts';
import { builtinCatalog } from '../src/completion.ts';
import { hoverAt, signatureAt } from '../src/hover.ts';
import type { DocumentContext } from '../src/module-files.ts';
import { fakeIo } from './helpers/run.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const stdlibDocs = join(root, 'docs/stdlib');
const docs = parseBuiltinDocs(Object.fromEntries(readdirSync(stdlibDocs).map((name) => [name, readFileSync(join(stdlibDocs, name), 'utf8')])));
const interpreter = createInterpreter(fakeIo());
const catalog = builtinCatalog(interpreter);
const GEOMETRY = ['proc area r', '| r * r', '3.14 => pi', 'export area pi'].join('\n');
const context: DocumentContext = { uri: 'file:///work/main.slop', catalog, docs, read: (uri) => (uri === 'file:///work/lib/geometry.slop' ? GEOMETRY : null) };

test('a page section gives each builtin it names a usage and the paragraph after it', () => {
  const parsed = parseBuiltinDocs({
    'text.md': ['# Text builtins', '', 'Work on text.', 'More about it.', '', '## shout', '', '`text -> text/shout`', '', 'Upper-cases', 'the text.', '', '```', 'x', '```'].join('\n'),
    'core.md': ['# Core', '', 'Intro.', '', '## show', '', '`value -> show`', '', 'Shows it.', '```', 'example', '```', '## next', '', '`x -> next`', '', 'Goes on.'].join('\n'),
    'clock.md': ['# Clock', '', 'Times.', '', '## clock/hour, clock/minute', '', '`time -> clock/hour` and so on', '', 'Each part.'].join('\n'),
    'notes.txt': '## ignored',
  });
  assert.deepEqual(parsed, {
    text: { usage: '', summary: 'Work on text. More about it.' },
    'text/shout': { usage: 'text -> text/shout', summary: 'Upper-cases the text.' },
    show: { usage: 'value -> show', summary: 'Shows it.' },
    next: { usage: 'x -> next', summary: 'Goes on.' },
    clock: { usage: '', summary: 'Times.' },
    'clock/hour': { usage: 'time -> clock/hour', summary: 'Each part.' },
    'clock/minute': { usage: 'time -> clock/minute', summary: 'Each part.' },
  });
});

test('docs/stdlib documents every builtin and every member of a builtin module, with a usage that names it', () => {
  const undocumented: string[] = [];
  for (const entry of catalog) {
    if (docs[entry.name] === undefined) undocumented.push(entry.name);
    for (const member of entry.members) {
      const name = `${entry.name}/${member.name}`;
      if (!(docs[name]?.usage.split(' ').includes(name) ?? false)) undocumented.push(name);
    }
  }
  assert.deepEqual(undocumented, []);
});

const SOURCE = [
  '"./lib/geometry" -> use => geometry',
  'proc add-all xs total',
  '| xs',
  '[1] -> add-all 0 => sum',
  '"a,b" -> string/split ","',
  '2 -> geometry/area',
  'io/print-line',
].join('\n');

function hovered(line: number, character: number): string | null {
  const hover = hoverAt(SOURCE, line, character, context);
  if (hover === null) return null;
  return typeof hover.contents === 'object' && 'value' in hover.contents ? hover.contents.value : null;
}

test('hovering a name of the program shows what it is: a procedure with its parameters, a parameter, a variable, a module', () => {
  assert.equal(hovered(3, 8), '```slopersons\nproc add-all xs total\n```');
  assert.equal(hovered(1, 6), '```slopersons\nproc add-all xs total\n```');
  assert.equal(hovered(2, 2), 'parameter `xs`');
  assert.equal(hovered(3, 20), 'variable `sum`');
  assert.equal(hovered(5, 7), 'module `geometry`, loaded from `./lib/geometry`');
});

test('hovering a builtin shows its usage and summary from docs/stdlib, and a builtin module its introduction', () => {
  assert.equal(hovered(4, 18), `\`\`\`slopersons\ntext -> string/split separator\n\`\`\`\n\n${docs['string/split']?.summary}`);
  assert.equal(hovered(6, 1), `builtin module \`io\`\n\n${docs['io']?.summary}`);
  assert.equal(hovered(6, 5), `\`\`\`slopersons\nvalue -> io/print-line\n\`\`\`\n\n${docs['io/print-line']?.summary}`);
});

test('hovering a member of a loaded module shows its declaration from the module file', () => {
  assert.equal(hovered(5, 15), '```slopersons\nproc area r\n```\n\nfrom `./lib/geometry`');
  assert.deepEqual(hoverAt(SOURCE, 5, 15, context)?.range, { start: { line: 5, character: 14 }, end: { line: 5, character: 18 } });
  assert.deepEqual(hoverAt('"./lib/geometry" -> use => geometry\ngeometry/pi', 1, 10, context)?.contents, { kind: 'markdown', value: 'variable `pi`\n\nfrom `./lib/geometry`' });
});

test('hovering a literal, an unknown name or an unexported member shows nothing', () => {
  assert.equal(hovered(3, 1), null);
  assert.equal(hoverAt('totl', 0, 1, context), null);
  assert.equal(hoverAt('"./lib/geometry" -> use => geometry\ngeometry/secret', 1, 11, context), null);
  assert.equal(hoverAt('"x" -> io/prnt', 0, 11, context), null);
});

function signature(...lines: string[]): string | null {
  const line = lines.length - 1;
  const help = signatureAt(lines.join('\n'), line, (lines[line] ?? '').length, context);
  const shown = help?.signatures[0];
  if (help === null || shown === undefined) return null;
  const active = shown.parameters?.[help.activeParameter ?? 0]?.label;
  const activeText = Array.isArray(active) ? shown.label.slice(active[0], active[1]) : 'none';
  return `${shown.label} | ${activeText}`;
}

test('signature help shows the usage of the builtin being called and the input being typed', () => {
  assert.equal(signature('"a" -> string/replace '), 'text -> string/replace old new | old');
  assert.equal(signature('"a" -> string/replace "a b" '), 'text -> string/replace old new | new');
  assert.equal(signature('"a" -> string/replace "a b"'), 'text -> string/replace old new | old');
  assert.equal(signature('"a" -> string/replace (1 + 2) [3 4] '), 'text -> string/replace old new | new');
  assert.equal(signature('"a" -> string/replace x + 1 '), 'text -> string/replace old new | new');
  assert.equal(signature('"a" -> string/replace not x '), 'text -> string/replace old new | new');
  assert.equal(signature('f -> do '), 'procedure -> do arg... | arg...');
});

test('an input in brackets, a character literal or not with its operand counts once', () => {
  assert.equal(signature('"a" -> string/replace [3 4]'), 'text -> string/replace old new | old');
  assert.equal(signature('"a" -> string/replace ` `'), 'text -> string/replace old new | old');
  assert.equal(signature('"a" -> string/replace not x'), 'text -> string/replace old new | old');
});

test('signature help for a procedure of the program or of a loaded module leaves out the piped input', () => {
  assert.equal(signature('proc scale value factor', '| value * factor', '2 -> scale '), 'proc scale value factor | factor');
  assert.equal(signature('proc pair left right', '| left', '1 -> pair 2 '), 'proc pair left right | right');
  assert.equal(signature('"./lib/geometry" -> use => geometry', '2 -> geometry/area '), 'proc area r | none');
});

test('signature help shows nothing while the callee is typed, after a lambda bar or another step, or for a name that is not a procedure', () => {
  assert.equal(signature('x -> string/spl'), null);
  assert.equal(signature('[1] -> array/map n | n'), null);
  assert.equal(signature('x -> f 1 => y '), null);
  assert.equal(signature('1 => total', 'x -> total '), null);
  assert.equal(signature('"a -> string/split '), null);
});
