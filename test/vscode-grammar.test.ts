import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import textmate from 'vscode-textmate';
import oniguruma from 'vscode-oniguruma';
import { KEYWORDS, lex, type Token } from '../src/lexer.ts';
import { createInterpreter } from '../src/cli.ts';
import { fakeIo } from './helpers/run.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const extensionDirectory = join(root, 'editors/vscode');
const grammarPath = join(extensionDirectory, 'syntaxes/slopersons.tmLanguage.json');
const grammarText = readFileSync(grammarPath, 'utf8');
const rawGrammar = JSON.parse(grammarText) as { repository: Record<string, { match?: string; patterns?: Array<{ match?: string }> }> };

const wasm = readFileSync(createRequire(import.meta.url).resolve('vscode-oniguruma/release/onig.wasm'));
await oniguruma.loadWASM(wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength));

const registry = new textmate.Registry({
  onigLib: Promise.resolve({
    createOnigScanner: (patterns: string[]) => new oniguruma.OnigScanner(patterns),
    createOnigString: (text: string) => new oniguruma.OnigString(text),
  }),
  loadGrammar: async (scopeName: string) => (scopeName === 'source.slop' ? textmate.parseRawGrammar(grammarText, grammarPath) : null),
});
const loadedGrammar = await registry.loadGrammar('source.slop');
if (loadedGrammar === null) throw new Error('the slopersons grammar did not load');
const grammar = loadedGrammar;

interface GrammarToken {
  text: string;
  start: number;
  end: number;
  scopes: string[];
}

interface Tokenized {
  lines: GrammarToken[][];
  closed: boolean;
}

const TOP_LEVEL = grammar.tokenizeLine('', textmate.INITIAL).ruleStack;

function tokenize(source: string): Tokenized {
  let stack = textmate.INITIAL;
  const lines: GrammarToken[][] = [];
  for (const line of source.split('\n')) {
    const result = grammar.tokenizeLine(line, stack);
    lines.push(result.tokens.map((token) => ({ text: line.slice(token.startIndex, token.endIndex), start: token.startIndex, end: token.endIndex, scopes: token.scopes })));
    stack = result.ruleStack;
  }
  return { lines, closed: stack.equals(TOP_LEVEL) };
}

function tokenAt(line: string, fragment: string, occurrence = 0): GrammarToken {
  let index = -1;
  for (let found = 0; found <= occurrence; found++) index = line.indexOf(fragment, index + 1);
  if (index < 0) throw new Error(`\`${fragment}\` is not in \`${line}\``);
  const token = tokenize(line).lines[0]?.find((candidate) => candidate.start <= index && index < candidate.end);
  if (token === undefined) throw new Error(`no token at \`${fragment}\``);
  return token;
}

function innermost(line: string, fragment: string, occurrence = 0): string {
  return tokenAt(line, fragment, occurrence).scopes.at(-1) ?? '';
}

function alternatives(pattern: string, opener: string): string[][] {
  const groups: string[][] = [];
  let index = pattern.indexOf(opener);
  while (index >= 0) {
    const start = index + opener.length;
    const end = pattern.indexOf(')', start);
    groups.push(pattern.slice(start, end).split('|'));
    index = pattern.indexOf(opener, end);
  }
  return groups;
}

function repositoryMatch(key: string): string {
  const match = rawGrammar.repository[key]?.match;
  if (match === undefined) throw new Error(`the grammar has no \`${key}\` match`);
  return match;
}

const sorted = (words: Iterable<string>): string[] => [...words].sort();

test('the keyword scopes list exactly the lexer keywords', () => {
  const words = (rawGrammar.repository['keywords']?.patterns ?? []).flatMap((pattern) => alternatives(pattern.match ?? '', '(?<![A-Za-z0-9/-])(?:').flat());
  assert.deepEqual(sorted(words), sorted(KEYWORDS));
});

test('parameter patterns exclude exactly the lexer keywords', () => {
  for (const key of ['lambda-parameters', 'procedure-declaration']) {
    const groups = alternatives(repositoryMatch(key), '(?!(?:');
    assert.ok(groups.length > 0, key);
    for (const group of groups) assert.deepEqual(sorted(group), sorted(KEYWORDS), key);
  }
});

test('every lexer keyword gets a keyword or language constant scope', () => {
  for (const word of KEYWORDS) {
    const scope = innermost(`${word} x`, word);
    assert.match(scope, /^(keyword\.|constant\.language\.)/, word);
  }
});

test('the builtin module and bare builtin lists match what the interpreter registers', () => {
  const interpreter = createInterpreter(fakeIo());
  const names = interpreter.builtinNames();
  const modules = names.filter((name) => interpreter.builtin(name)?.type === 'module');
  const procedures = names.filter((name) => interpreter.builtin(name)?.type !== 'module');
  assert.deepEqual(sorted(alternatives(repositoryMatch('builtin-modules'), '(?:').flat()), sorted(modules));
  assert.deepEqual(sorted(alternatives(repositoryMatch('builtin-procedures'), '(?:').flat()), sorted(procedures));
});

test('hyphens join names, and a keyword inside a name is not a keyword', () => {
  assert.equal(tokenAt('not-empty => x', 'not-empty').text, 'not-empty');
  assert.equal(innermost('not-empty -> f', 'not-empty'), 'variable.other.slop');
  assert.equal(innermost('is-no => x', 'is-no'), 'variable.other.slop');
  assert.equal(innermost('a-b + 1', 'a-b'), 'variable.other.slop');
  assert.equal(tokenAt('a-b + 1', 'a-b').text, 'a-b');
  assert.equal(innermost('a - b', '-'), 'keyword.operator.arithmetic.slop');
  assert.equal(innermost('not x', 'not'), 'keyword.operator.word.slop');
  assert.equal(innermost('n mod 3', 'mod'), 'keyword.operator.word.slop');
});

test('qualified names split into module and member; spaced slashes divide', () => {
  assert.equal(innermost('io/print-line => p', 'io'), 'support.module.slop');
  assert.equal(innermost('io/print-line => p', 'print-line'), 'entity.name.function.member.slop');
  assert.equal(innermost('geometry/pi => p', 'geometry'), 'entity.name.namespace.slop');
  assert.equal(innermost('a / b', '/'), 'keyword.operator.arithmetic.slop');
  assert.equal(innermost('a /= b', '/='), 'keyword.operator.comparison.slop');
  assert.equal(innermost('io-like/x => y', 'io-like'), 'entity.name.namespace.slop');
});

test('flows mark the callee, bare builtins and bound names', () => {
  const line = 'x -> double 3 => y -> io/print-line';
  assert.equal(innermost(line, '->'), 'keyword.operator.flow.slop');
  assert.equal(innermost(line, 'double'), 'entity.name.function.call.slop');
  assert.equal(innermost(line, '3'), 'constant.numeric.integer.slop');
  assert.equal(innermost(line, '=>'), 'keyword.operator.binding.slop');
  assert.equal(innermost(line, 'y'), 'variable.other.assignment.slop');
  assert.equal(innermost(line, 'io'), 'support.module.slop');
  assert.ok(tokenAt(line, 'print-line').scopes.includes('entity.name.function.call.slop'));
  assert.equal(innermost('total + n =>> total', '=>>'), 'keyword.operator.binding.slop');
  assert.equal(innermost('total + n =>> total', 'total', 1), 'variable.other.assignment.slop');
  assert.equal(innermost('add -> do 1 2', 'do'), 'support.function.builtin.slop');
  assert.equal(innermost('x -> type-of', 'type-of'), 'support.function.builtin.slop');
  assert.equal(innermost('x -> done', 'done'), 'entity.name.function.call.slop');
});

test('procedure declarations mark the name and the parameters', () => {
  const line = 'proc describe n limit | n > limit';
  assert.equal(innermost(line, 'proc'), 'keyword.control.proc.slop');
  assert.equal(innermost(line, 'describe'), 'entity.name.function.slop');
  assert.equal(innermost(line, 'n'), 'variable.parameter.slop');
  assert.equal(innermost(line, 'limit'), 'variable.parameter.slop');
  assert.equal(innermost(line, 'n', 1), 'variable.other.slop');
  assert.equal(innermost('proc report', 'report'), 'entity.name.function.slop');
});

test('names before a bar are lambda parameters; margin bars are not', () => {
  const line = 'xs -> array/reduce 0 acc n | acc + n';
  assert.equal(innermost(line, 'acc'), 'variable.parameter.slop');
  assert.equal(innermost(line, 'n |'), 'variable.parameter.slop');
  assert.equal(innermost(line, '0'), 'constant.numeric.integer.slop');
  assert.equal(innermost(line, '|'), 'keyword.operator.lambda.slop');
  assert.equal(innermost(line, 'acc', 1), 'variable.other.slop');
  assert.equal(innermost('| | x > 0 ?', '|'), 'punctuation.definition.margin.slop');
  assert.equal(innermost('| | x > 0 ?', '|', 1), 'punctuation.definition.margin.slop');
  assert.equal(innermost('| n | n + k', 'n'), 'variable.parameter.slop');
  assert.equal(innermost('| n | n + k', '|', 1), 'keyword.operator.lambda.slop');
  assert.equal(innermost('recover e | 0', 'recover'), 'keyword.control.slop');
  assert.equal(innermost('recover e | 0', 'e |'), 'variable.parameter.slop');
  assert.equal(innermost('(| "hello" -> io/print-line)', '|'), 'keyword.operator.lambda.slop');
});

test('strings mark escapes, interpolation and errors', () => {
  const line = '"total: {x -> double}!\\t" => s';
  assert.equal(innermost(line, '"'), 'punctuation.definition.string.begin.slop');
  assert.equal(innermost(line, 'total'), 'string.quoted.double.slop');
  assert.equal(innermost(line, '{'), 'punctuation.section.interpolation.begin.slop');
  assert.equal(innermost(line, 'double'), 'entity.name.function.call.slop');
  assert.ok(tokenAt(line, 'double').scopes.includes('meta.embedded.line.interpolation.slop'));
  assert.equal(innermost(line, '}'), 'punctuation.section.interpolation.end.slop');
  assert.equal(innermost(line, '\\t'), 'constant.character.escape.slop');
  assert.equal(innermost(line, 's'), 'variable.other.assignment.slop');
  assert.equal(innermost('"a\\qb"', '\\q'), 'invalid.illegal.escape.slop');
  assert.equal(innermost('"a}b"', '}'), 'invalid.illegal.brace.slop');
  assert.equal(innermost('"\\{literal\\}"', '\\{'), 'constant.character.escape.slop');
  assert.equal(innermost('"~ not a comment"', '~'), 'string.quoted.double.slop');
});

test('a string inside an interpolation is a nested string', () => {
  const line = '"{n > 1 ? "many" : "one"} items" -> io/print-line';
  assert.equal(innermost(line, 'many'), 'string.quoted.double.slop');
  assert.equal(tokenAt(line, 'many').scopes.filter((scope) => scope === 'string.quoted.double.slop').length, 2);
  assert.equal(innermost(line, '?'), 'keyword.operator.conditional.slop');
  assert.equal(innermost(line, 'items'), 'string.quoted.double.slop');
  assert.equal(innermost(line, '->'), 'keyword.operator.flow.slop');
  assert.equal(innermost('"{ {"a": 1} -> hashmap/length }" => s', 's', 1), 'variable.other.assignment.slop');
});

test('an unterminated string ends with its line', () => {
  const tokenized = tokenize('"open\nx -> f');
  assert.equal(tokenized.lines[1]?.[0]?.scopes.at(-1), 'variable.other.slop');
  assert.equal(tokenized.closed, true);
});

test('a hashmap spans lines, and an unclosed one stays open to the end', () => {
  const tokenized = tokenize('{"name": "Ada"\n "born": 1815} => person');
  assert.equal(tokenized.closed, true);
  assert.equal(tokenized.lines[1]?.find((token) => token.text === 'person')?.scopes.at(-1), 'variable.other.assignment.slop');
  assert.equal(tokenize('{"name": "Ada"\nx -> f').closed, false);
});

test('chars, numbers and comments', () => {
  assert.equal(innermost('`a` => c', 'a'), 'string.quoted.single.char.slop');
  assert.equal(innermost('`\\n` => c', '\\n'), 'constant.character.escape.slop');
  assert.equal(innermost('`\\q` => c', '\\q'), 'invalid.illegal.escape.slop');
  assert.equal(tokenAt('`👍` => c', '`').text, '`👍`');
  assert.equal(tokenAt('1_000_000 => n', '1').text, '1_000_000');
  assert.equal(innermost('1_000_000 => n', '1'), 'constant.numeric.integer.slop');
  assert.equal(tokenAt('3.14 => n', '3').text, '3.14');
  assert.equal(innermost('3.14 => n', '3'), 'constant.numeric.float.slop');
  assert.equal(innermost('-7 => n', '-'), 'keyword.operator.arithmetic.slop');
  assert.equal(innermost('x2 => n', 'x2'), 'variable.other.slop');
  assert.equal(innermost('5 => x   ~ a trailing comment', 'trailing'), 'comment.line.tilde.slop');
  assert.equal(innermost('yes => a', 'yes'), 'constant.language.boolean.slop');
  assert.equal(innermost('nothing => a', 'nothing'), 'constant.language.nothing.slop');
});

function slopFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return slopFiles(path);
    return entry.name.endsWith('.slop') ? [path] : [];
  });
}

function lexerTokens(tokens: Token[]): Token[] {
  return tokens.flatMap((token) => (token.kind === 'string' ? [token, ...token.parts.flatMap((part) => (part.kind === 'expr' ? lexerTokens(part.tokens) : []))] : [token]));
}

const EXPECTED_SCOPE: Record<Token['kind'], RegExp> = {
  keyword: /^(keyword\.|constant\.language\.)/,
  int: /^constant\.numeric\.integer\./,
  float: /^constant\.numeric\.float\./,
  string: /^punctuation\.definition\.string\.begin\./,
  char: /^string\.quoted\.single\.char\./,
  qualified: /^(entity\.name\.namespace|support\.module)\./,
  name: /^(variable\.|entity\.name\.function|support\.function\.builtin)/,
  op: /^(keyword\.operator\.|punctuation\.)/,
};

const sources = ['docs/examples', 'test/programs', 'src/stdlib'].flatMap((directory) => slopFiles(join(root, directory)));

test('every token the lexer reads in the repository gets the matching scope', () => {
  const mismatches: string[] = [];
  let checked = 0;
  for (const file of sources) {
    const source = readFileSync(file, 'utf8');
    let lines;
    try {
      lines = lex(source);
    } catch {
      continue;
    }
    checked++;
    const tokenized = tokenize(source);
    const name = relative(root, file);
    if (!tokenized.closed) mismatches.push(`${name}: a rule is still open at the end of the file`);
    tokenized.lines.forEach((tokens, index) => {
      for (const token of tokens) if (token.scopes.some((scope) => scope.startsWith('invalid.'))) mismatches.push(`${name}:${index + 1}: \`${token.text}\` is marked invalid`);
    });
    for (const token of lexerTokens(lines.flatMap((line) => line.tokens))) {
      const { line, col } = token.position;
      const grammarToken = tokenized.lines[line - 1]?.find((candidate) => candidate.start <= col - 1 && col - 1 < candidate.end);
      const scope = grammarToken?.scopes.at(-1) ?? '(none)';
      if (!EXPECTED_SCOPE[token.kind].test(scope)) mismatches.push(`${name}:${line}:${col}: ${token.kind} \`${grammarToken?.text ?? ''}\` got ${scope}`);
    }
  }
  assert.ok(checked >= 30, `only ${checked} of ${sources.length} files lexed`);
  assert.deepEqual(mismatches.slice(0, 30), []);
});

interface EnterRule {
  beforeText: string;
  action: { appendText?: string };
}

const configuration = JSON.parse(readFileSync(join(extensionDirectory, 'language-configuration.json'), 'utf8')) as { onEnterRules: EnterRule[]; comments: { lineComment: string } };

function appendedOnEnter(line: string): string | null {
  const rule = configuration.onEnterRules.find((candidate) => new RegExp(candidate.beforeText).test(line));
  return rule?.action.appendText ?? null;
}

test('Enter inside a block repeats the margin bars', () => {
  assert.equal(appendedOnEnter('| x -> f'), '| ');
  assert.equal(appendedOnEnter('| | x > 0 ?'), '| | ');
  assert.equal(appendedOnEnter('  |  |  | x'), '| | | ');
  assert.equal(appendedOnEnter('| n | n + k'), '| ');
  assert.equal(appendedOnEnter('| : n mod 3 = 0 ? "Fizz"'), '| ');
});

test('Enter on a line of only bars, or outside a block, adds no bars', () => {
  assert.equal(appendedOnEnter('|'), null);
  assert.equal(appendedOnEnter('| '), null);
  assert.equal(appendedOnEnter('| | '), null);
  assert.equal(appendedOnEnter('x -> f'), null);
  assert.equal(appendedOnEnter('proc double n | n * 2'), null);
});

test('the line comment is a tilde', () => {
  assert.equal(configuration.comments.lineComment, '~');
});
