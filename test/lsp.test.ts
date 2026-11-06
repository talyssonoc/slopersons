import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DiagnosticSeverity, DocumentHighlightKind, SemanticTokenTypes, type Range } from 'vscode-languageserver/node';
import { createInterpreter } from '../src/cli.ts';
import { builtinCatalog } from '../src/completion.ts';
import type { DocumentContext } from '../src/module-files.ts';
import { SEMANTIC_TOKENS_LEGEND, definitionAt, diagnosticsFor, encodeSemanticTokens, highlightsAt, referencesAt, semanticTokensFor } from '../src/lsp.ts';
import { defineLanguageServerTests } from './helpers/language-server.ts';
import { repositoryPrograms } from './helpers/repository-programs.ts';
import { fakeIo } from './helpers/run.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const bin = join(root, 'bin/slopersons.mjs');
const catalog = builtinCatalog(createInterpreter(fakeIo()));
const context: DocumentContext = { uri: 'file:///work/main.slop', catalog, read: () => null, docs: {} };

function readFromDisk(uri: string): string | null {
  try {
    return readFileSync(fileURLToPath(uri), 'utf8');
  } catch {
    return null;
  }
}

function ranges(source: string): Array<[number, number, number, string]> {
  return diagnosticsFor(source, context).map((diagnostic) => [diagnostic.range.start.line, diagnostic.range.start.character, diagnostic.range.end.character, typeof diagnostic.message === 'string' ? diagnostic.message : diagnostic.message.value]);
}

test('a diagnostic covers the whole name the error points at', () => {
  assert.deepEqual(ranges('1 => geometry/pi'), [[0, 5, 16, 'expected a name after `=>`']]);
});

test('an error at the end of a line covers its last character', () => {
  assert.deepEqual(ranges('5 => x\nx ->'), [[1, 3, 4, 'expected a procedure name after `->`, found end of line']]);
  assert.deepEqual(ranges('1 +'), [[0, 2, 3, 'expected a value, found end of line']]);
});

test('an error at a symbol covers that symbol', () => {
  assert.deepEqual(ranges('"open'), [[0, 0, 1, 'unterminated string']]);
});

test('each broken top-level statement gets its own diagnostic, and a valid file gets none', () => {
  assert.deepEqual(
    ranges('1 +\n2 => y\nx ->'),
    [
      [0, 2, 3, 'expected a value, found end of line'],
      [2, 3, 4, 'expected a procedure name after `->`, found end of line'],
    ],
  );
  assert.deepEqual(diagnosticsFor('[1 2 3] -> array/each n\n| n -> io/print-line', context), []);
  assert.equal(diagnosticsFor('x ->', context)[0]?.source, 'slopersons');
});

function warnings(...lines: string[]): string[] {
  return diagnosticsFor(lines.join('\n'), context).map((diagnostic) => {
    const severity = diagnostic.severity === DiagnosticSeverity.Warning ? 'warning' : 'error';
    const message = typeof diagnostic.message === 'string' ? diagnostic.message : diagnostic.message.value;
    return `${severity} ${diagnostic.range.start.line}:${diagnostic.range.start.character}-${diagnostic.range.end.character} ${message}`;
  });
}

test('a name bound nowhere is a warning with the message running the program would give, a builtin is not', () => {
  assert.deepEqual(warnings('0 => total', '[1 2] -> array/each n', '| totl + n =>> total', 'total -> io/print-line'), ['warning 2:2-6 unknown name `totl`']);
  assert.deepEqual(warnings('totl/area -> io/print-line'), ['warning 0:0-4 unknown name `totl`']);
  assert.deepEqual(warnings('"{missing}" -> io/print-line'), ['warning 0:2-9 unknown name `missing`']);
});

test('=>> with no binding to update is a warning, even for a builtin name', () => {
  assert.deepEqual(warnings('1 =>> total'), ['warning 0:6-11 `=>> total` found no existing binding named `total`']);
  assert.deepEqual(warnings('1 =>> io'), ['warning 0:6-8 `=>> io` found no existing binding named `io`']);
});

test('a use before its binding in the same scope is a warning, a procedure called before it is declared is not', () => {
  assert.deepEqual(warnings('x -> io/print-line', '1 => x'), ['warning 0:0-1 unknown name `x`']);
  assert.deepEqual(warnings('proc first', '| 1 -> second', 'proc second n', '| n'), []);
});

test('a name that appears in a statement that does not parse is not reported, other unknown names still are', () => {
  assert.deepEqual(warnings('1 + => total', 'total -> io/print-line', 'totl -> io/print-line'), [
    'error 0:4-5 expected a value, found `=>`',
    'warning 2:0-4 unknown name `totl`',
  ]);
  assert.deepEqual(warnings('[1] -> array/each', '| 1 + => total', 'total -> io/print-line'), ['error 1:6-7 expected a value, found `=>`']);
  assert.deepEqual(warnings('"{total +}" -> io/print-line', 'total -> io/print-line'), ['error 0:2-7 expected a value, found end of line']);
});

// shapes.slop reads a name its module does not export on purpose, inside `attempt`, to show the error.
const EXPECTED_WARNINGS: Record<string, string[]> = { 'docs/examples/shapes.slop': ['module `geometry` has no exported name `secret`'] };

test('the repository programs get no warnings, except the unknown names golden programs expect and the error an example shows', () => {
  const programs = repositoryPrograms();
  assert.ok(programs.length >= 30);
  for (const program of programs) {
    const errorFile = program.slice(0, -'.slop'.length) + '.err';
    const expected = existsSync(errorFile) ? /unknown name `[^`]+`/.exec(readFileSync(errorFile, 'utf8'))?.[0] : undefined;
    const programContext = { uri: pathToFileURL(program).href, catalog, read: readFromDisk, docs: {} };
    const messages = diagnosticsFor(readFileSync(program, 'utf8'), programContext).map((diagnostic) => diagnostic.message);
    assert.deepEqual(messages, EXPECTED_WARNINGS[program.slice(root.length)] ?? (expected === undefined ? [] : [expected]), program);
  }
});

function marked(...lines: string[]): string[] {
  return semanticTokensFor(lines.join('\n')).map((token) => {
    const text = lines[token.line]?.slice(token.character, token.character + token.length);
    return `${token.declaration ? 'declared ' : ''}${token.type} ${text} ${token.line}:${token.character}`;
  });
}

test('lambda parameters are marked where they are declared and used, in every form a lambda takes', () => {
  assert.deepEqual(marked('xs -> fold 0 acc n', '| acc + n'), ['declared parameter acc 0:13', 'declared parameter n 0:17', 'parameter acc 1:2', 'parameter n 1:8']);
  assert.deepEqual(marked('xs -> keep item | item > 1'), ['declared parameter item 0:11', 'parameter item 0:18']);
  assert.deepEqual(marked('x y | x + y'), ['declared parameter x 0:0', 'declared parameter y 0:2', 'parameter x 0:6', 'parameter y 0:10']);
  assert.deepEqual(marked('left right', '| left + right'), ['declared parameter left 0:0', 'declared parameter right 0:5', 'parameter left 1:2', 'parameter right 1:9']);
  assert.deepEqual(marked('(| 1) => one'), []);
});

test('procedure parameters, parameters used inside nested lambdas and inside interpolation are marked, other names are not', () => {
  assert.deepEqual(marked('proc show-all xs', '| xs -> array/each x', '| | x -> io/print-line'), ['declared parameter xs 0:14', 'parameter xs 1:2', 'declared parameter x 1:19', 'parameter x 2:4']);
  assert.deepEqual(marked('proc scale factor', '| [1] -> array/map n | n * factor'), ['declared parameter factor 0:11', 'declared parameter n 1:19', 'parameter n 1:23', 'parameter factor 1:27']);
  assert.deepEqual(marked('"doubled: {[1] -> array/map n | n * 2}" -> io/print-line'), ['declared parameter n 0:28', 'parameter n 0:32']);
  assert.deepEqual(marked('5 => n', 'xs -> keep n | n > 1', 'n -> io/print-line'), ['declared parameter n 1:11', 'parameter n 1:15']);
});

test('lambdas inside loops, conditionals, attempts, arrays and operators are marked', () => {
  const declared = marked(
    'while yes',
    '| xs -> keep a | a > 1',
    'ok ? [(xs -> keep b | b > 1)] : nothing',
    'ok ?',
    '| xs -> keep c | c > 1',
    ':',
    '| xs -> keep d | d > 1',
    'attempt',
    '| xs -> keep e | e > 1',
    'recover problem',
    '| xs -> keep f | f > 1',
    'always',
    '| xs -> keep g | g > 1',
    '1 + (xs -> array/count h | h > 1) => total',
    'not (xs -> any i | i > 1) => none',
  ).filter((token) => token.startsWith('declared '));
  assert.deepEqual(
    declared.map((token) => token.split(' ').slice(2).join(' ')),
    ['a 1:13', 'b 2:18', 'c 4:13', 'd 6:13', 'e 8:13', 'f 10:13', 'g 12:13', 'h 13:23', 'i 14:15'],
  );
});

test('the colon between a hashmap key and its value is marked, the conditional colon is not', () => {
  assert.deepEqual(marked('{"a": 1 "b": 2} => pairs'), ['keyValueSeparator : 0:4', 'keyValueSeparator : 0:11']);
  assert.deepEqual(marked('x > 1 ? "many" : "one"'), []);
});

test('statements that parse are marked while another is broken, and a lexer error marks nothing', () => {
  assert.deepEqual(marked('x ->', 'xs -> keep n | n > 1'), ['declared parameter n 1:11', 'parameter n 1:15']);
  assert.deepEqual(marked('xs -> keep n | n > 1', '"open'), []);
});

test('semantic tokens are encoded relative to the previous token, with the declaration modifier on declarations', () => {
  assert.deepEqual(encodeSemanticTokens(semanticTokensFor('xs -> fold 0 acc n\n| {"a": acc}')), [0, 13, 3, 0, 1, 0, 4, 1, 0, 1, 1, 6, 1, 1, 0, 0, 2, 3, 0, 0]);
});

function definitionRange(source: string, line: number, character: number): Range | null {
  return definitionAt(source, line, character, context)?.range ?? null;
}

const PROGRAM = ['0 => total', 'proc add-all xs', '| xs -> array/each n', '| | total + n =>> total', '| total', '[1 2] -> add-all -> io/print-line'].join('\n');

function at(range: Range | null | undefined): string {
  return range === null || range === undefined ? 'nothing' : `${range.start.line}:${range.start.character}-${range.end.character}`;
}

test('go to definition finds the declaration of a binding, a procedure or a parameter, from any character of the name', () => {
  assert.equal(at(definitionRange(PROGRAM, 3, 4)), '0:5-10');
  assert.equal(at(definitionRange(PROGRAM, 3, 9)), '0:5-10');
  assert.equal(at(definitionRange(PROGRAM, 3, 18)), '0:5-10');
  assert.equal(at(definitionRange(PROGRAM, 5, 10)), '1:5-12');
  assert.equal(at(definitionRange(PROGRAM, 3, 12)), '2:19-20');
  assert.equal(at(definitionRange(PROGRAM, 0, 5)), '0:5-10');
});

test('go to definition finds nothing on a builtin, a literal or between names', () => {
  assert.equal(at(definitionRange(PROGRAM, 5, 21)), 'nothing');
  assert.equal(at(definitionRange(PROGRAM, 5, 1)), 'nothing');
  assert.equal(at(definitionRange(PROGRAM, 3, 10)), 'nothing');
  assert.equal(at(definitionRange('x ->', 0, 0)), 'nothing');
});

test('references list every occurrence of the same binding, with or without its declaration', () => {
  assert.deepEqual(referencesAt(PROGRAM, 4, 3, true).map(at), ['0:5-10', '3:4-9', '3:18-23', '4:2-7']);
  assert.deepEqual(referencesAt(PROGRAM, 4, 3, false).map(at), ['3:4-9', '3:18-23', '4:2-7']);
  assert.deepEqual(referencesAt('1 => x\nproc f\n| 2 => x\n| x\nx', 3, 2, true).map(at), ['2:7-8', '3:2-3']);
  assert.deepEqual(referencesAt(PROGRAM, 5, 21, true), []);
});

test('highlights mark declarations and =>> updates as writes and other uses as reads', () => {
  assert.deepEqual(
    highlightsAt(PROGRAM, 0, 5).map((highlight) => `${at(highlight.range)} ${highlight.kind === DocumentHighlightKind.Write ? 'write' : 'read'}`),
    ['0:5-10 write', '3:4-9 read', '3:18-23 write', '4:2-7 read'],
  );
});

test('every semantic token type is standard or declared by the VS Code extension with a TextMate scope', () => {
  const manifest = JSON.parse(readFileSync(join(root, 'editors/vscode/package.json'), 'utf8')) as {
    contributes: { semanticTokenTypes: Array<{ id: string }>; semanticTokenScopes: Array<{ language: string; scopes: Record<string, string[]> }> };
  };
  const standard: string[] = Object.values(SemanticTokenTypes);
  const declared = manifest.contributes.semanticTokenTypes.map((type) => type.id);
  const scoped = manifest.contributes.semanticTokenScopes.filter((entry) => entry.language === 'slopersons').flatMap((entry) => Object.keys(entry.scopes));
  const custom = SEMANTIC_TOKENS_LEGEND.tokenTypes.filter((type) => !standard.includes(type));
  assert.deepEqual(custom, ['keyValueSeparator']);
  assert.deepEqual(declared, custom);
  assert.deepEqual(scoped, custom);
});

test('--lsp accepts only --stdio after it', () => {
  const result = spawnSync(bin, ['--lsp', 'file.slop'], { encoding: 'utf8', timeout: 30_000 });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /--lsp takes no file or arguments other than --stdio/);
});

defineLanguageServerTests('', () => [bin]);
