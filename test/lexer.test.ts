import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lex, type Token } from '../src/lexer.ts';
import { SloError } from '../src/errors.ts';

function brief(token: Token): string {
  switch (token.kind) {
    case 'int':
      return `int:${token.value}`;
    case 'float':
      return `float:${token.value}`;
    case 'string':
      return `string:${token.parts.map((part) => (part.kind === 'text' ? JSON.stringify(part.text) : `{${part.tokens.map(brief).join(' ')}}`)).join('+')}`;
    case 'char':
      return `char:${token.value}`;
    case 'name':
      return `name:${token.name}`;
    case 'keyword':
      return `kw:${token.word}`;
    case 'op':
      return token.unary ? `op:${token.op}(unary)` : `op:${token.op}`;
  }
}

function lexBrief(source: string): string[] {
  return lex(source).map((line) => `${line.depth}: ${line.tokens.map(brief).join(' ')}`);
}

function lexError(source: string): SloError {
  try {
    lex(source);
  } catch (error) {
    if (error instanceof SloError) return error;
    throw error;
  }
  throw new Error('expected a parse error');
}

test('margin bars set the depth and are not tokens', () => {
  assert.deepEqual(lexBrief('a\n| b\n| | c\n||d\n  |  e'), ['0: name:a', '1: name:b', '2: name:c', '2: name:d', '1: name:e']);
});

test('blank lines and comment-only lines are dropped, comments end at the line', () => {
  assert.deepEqual(lexBrief('~ header\n\na ~ trailing\n   \n| ~ only a comment\n| b'), ['0: name:a', '1: name:b']);
});

test('kebab-case names are single tokens and spaced minus is an operator', () => {
  assert.deepEqual(lexBrief('a-b a - b'), ['0: name:a-b name:a op:- name:b']);
});

test('minus directly before an operand after whitespace is unary', () => {
  assert.deepEqual(lexBrief('a -b'), ['0: name:a op:-(unary) name:b']);
  assert.deepEqual(lexBrief('[1 -2]'), ['0: op:[ int:1 op:-(unary) int:2 op:]']);
  assert.deepEqual(lexBrief('(-x)'), ['0: op:( op:-(unary) name:x op:)']);
  assert.deepEqual(lexBrief('-5'), ['0: op:-(unary) int:5']);
  assert.deepEqual(lexBrief('a- b'), ['0: name:a op:- name:b']);
});

test('multi-character operators are lexed greedily', () => {
  assert.deepEqual(lexBrief('x -> f => y =>> z /= <= >= = < >'), [
    '0: name:x op:-> name:f op:=> name:y op:=>> name:z op:/= op:<= op:>= op:= op:< op:>',
  ]);
});

test('reserved words become keyword tokens', () => {
  assert.deepEqual(lexBrief('proc while yes no nothing and or not mod'), [
    '0: kw:proc kw:while kw:yes kw:no kw:nothing kw:and kw:or kw:not kw:mod',
  ]);
});

test('numbers: ints with separators, floats, and rejected forms', () => {
  assert.deepEqual(lexBrief('1_000 3.14 0.5'), ['0: int:1000 float:3.14 float:0.5']);
  assert.match(lexError('12abc').message, /invalid number/);
  assert.match(lexError('1.foo').message, /invalid number/);
  assert.match(lexError('1.').message, /invalid number/);
});

test('strings: escapes, interpolation with nested strings, and errors', () => {
  assert.deepEqual(lexBrief('"a\\"b\\\\c\\n\\{d\\}"'), ['0: string:"a\\"b\\\\c\\n{d}"']);
  assert.deepEqual(lexBrief('"x is {x -> double} and {"inner {y}"}"'), [
    '0: string:"x is "+{name:x op:-> name:double}+" and "+{string:"inner "+{name:y}}',
  ]);
  assert.deepEqual(lexBrief('""'), ['0: string:']);
  assert.match(lexError('"abc').message, /unterminated string/);
  assert.match(lexError('"abc\n"').message, /unterminated string/);
  assert.match(lexError('"a {} b"').message, /empty interpolation/);
  assert.match(lexError('"a {b"').message, /unterminated interpolation/);
  assert.match(lexError('"a } b"').message, /unmatched `}`/);
  assert.match(lexError('"\\q"').message, /unknown escape/);
});

test('chars: one code point or an escape', () => {
  assert.deepEqual(lexBrief('`a` `👍` `\\n` `\\``'), ['0: char:a char:👍 char:\n char:`']);
  assert.match(lexError('`ab`').message, /exactly one character/);
  assert.match(lexError('``').message, /exactly one character/);
});

test('open brackets join physical lines and suppress margin detection', () => {
  assert.deepEqual(lexBrief('[1\n  2\n| 3]\nx'), ['0: op:[ int:1 int:2 op:| int:3 op:] ', '0: name:x'].map((s) => s.trimEnd()));
});

test('bracket errors carry the position of the offending bracket', () => {
  const unclosed = lexError('a\n(1 + 2');
  assert.match(unclosed.message, /unclosed `\(`/);
  assert.deepEqual(unclosed.pos, { line: 2, col: 1 });
  assert.match(lexError('a)').message, /unmatched `\)`/);
  assert.match(lexError('(a]').message, /does not match/);
});

test('tokens carry one-based line and column positions', () => {
  const lines = lex('ab cd\n| "x" 12');
  assert.deepEqual(lines.map((line) => line.tokens.map((token) => `${token.pos.line}:${token.pos.col}`)), [
    ['1:1', '1:4'],
    ['2:3', '2:7'],
  ]);
  assert.deepEqual(lines[1]?.pos, { line: 2, col: 3 });
});

test('unexpected characters are reported with their position', () => {
  const error = lexError('a\nb @');
  assert.match(error.message, /unexpected character `@`/);
  assert.deepEqual(error.pos, { line: 2, col: 3 });
});
