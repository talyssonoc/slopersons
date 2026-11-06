import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SemanticTokenTypes } from 'vscode-languageserver/node';
import { SEMANTIC_TOKENS_LEGEND, diagnosticsFor, encodeSemanticTokens, semanticTokensFor } from '../src/lsp.ts';
import { defineLanguageServerTests } from './helpers/language-server.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const bin = join(root, 'bin/slopersons.mjs');

function ranges(source: string): Array<[number, number, number, string]> {
  return diagnosticsFor(source).map((diagnostic) => [diagnostic.range.start.line, diagnostic.range.start.character, diagnostic.range.end.character, typeof diagnostic.message === 'string' ? diagnostic.message : diagnostic.message.value]);
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
  assert.deepEqual(diagnosticsFor('[1 2 3] -> array/each n\n| n -> io/print-line'), []);
  assert.equal(diagnosticsFor('x ->')[0]?.source, 'slopersons');
});

function tokens(source: string): Array<[number, number, number, string]> {
  return semanticTokensFor(source).map((token) => [token.line, token.character, token.length, token.type]);
}

test('lambda parameters are marked in every form a lambda takes, including block form', () => {
  assert.deepEqual(tokens('xs -> fold 0 acc n\n| acc + n'), [
    [0, 13, 3, 'parameter'],
    [0, 17, 1, 'parameter'],
  ]);
  assert.deepEqual(tokens('xs -> keep item | item > 1'), [[0, 11, 4, 'parameter']]);
  assert.deepEqual(tokens('x y | x + y'), [
    [0, 0, 1, 'parameter'],
    [0, 2, 1, 'parameter'],
  ]);
  assert.deepEqual(tokens('left right\n| left + right'), [
    [0, 0, 4, 'parameter'],
    [0, 5, 5, 'parameter'],
  ]);
  assert.deepEqual(tokens('(| 1) => one'), []);
});

test('lambdas nested in procedures and string interpolation are marked, procedure parameters are left to the grammar', () => {
  assert.deepEqual(tokens('proc show-all xs\n| xs -> array/each x\n| | x -> io/print-line'), [[1, 19, 1, 'parameter']]);
  assert.deepEqual(tokens('"doubled: {[1] -> array/map n | n * 2}" -> io/print-line'), [[0, 28, 1, 'parameter']]);
});

test('lambdas inside loops, conditionals, attempts, arrays and operators are marked', () => {
  const lines = [
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
  ];
  const marked = semanticTokensFor(lines.join('\n')).map((token) => `${lines[token.line]?.slice(token.character, token.character + token.length)}@${token.line}`);
  assert.deepEqual(marked, ['a@1', 'b@2', 'c@4', 'd@6', 'e@8', 'f@10', 'g@12', 'h@13', 'i@14']);
});

test('the colon between a hashmap key and its value is marked, the conditional colon is not', () => {
  assert.deepEqual(tokens('{"a": 1 "b": 2} => pairs'), [
    [0, 4, 1, 'keyValueSeparator'],
    [0, 11, 1, 'keyValueSeparator'],
  ]);
  assert.deepEqual(tokens('x > 1 ? "many" : "one"'), []);
});

test('statements that parse are marked while another is broken, and a lexer error marks nothing', () => {
  assert.deepEqual(tokens('x ->\nxs -> keep n | n > 1'), [[1, 11, 1, 'parameter']]);
  assert.deepEqual(tokens('xs -> keep n | n > 1\n"open'), []);
});

test('semantic tokens are encoded relative to the previous token, parameters as declarations', () => {
  assert.deepEqual(encodeSemanticTokens(semanticTokensFor('xs -> fold 0 acc n\n| {"a": acc}')), [0, 13, 3, 0, 1, 0, 4, 1, 0, 1, 1, 6, 1, 1, 0]);
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
