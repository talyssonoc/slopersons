import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = join(root, 'src');

function listSources(directory: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) out.push(...listSources(path));
    else if (name.endsWith('.ts')) out.push(path);
  }
  return out;
}

interface Rule {
  pattern: RegExp;
  reason: string;
  allowedIn: string[];
}

const FRONT_END = ['src/lexer.ts', 'src/line-tree.ts', 'src/parser.ts', 'src/ast.ts', 'src/errors.ts'];

const rules: Rule[] = [
  { pattern: /\bnew (Map|Set|WeakMap|WeakSet)\b/, reason: 'slopersons containers use src/runtime/hashtable.ts; JS Map is only for interpreter bookkeeping', allowedIn: [...FRONT_END, 'src/interpreter.ts'] },
  { pattern: /\.(sort|toSorted)\(/, reason: 'sorting goes through src/runtime/sorting.ts', allowedIn: [] },
  { pattern: /\bnew Date\b|\bDate\.(UTC|parse)\b|\.getUTC|\.getFullYear|\.getMonth|\.getDate|\.getDay\b/, reason: 'calendar math lives in src/runtime/calendar.ts', allowedIn: [] },
  { pattern: /\bTemporal\b|\bIntl\b/, reason: 'no Temporal or Intl anywhere', allowedIn: [] },
  { pattern: /\.(indexOf|lastIndexOf|includes|startsWith|endsWith|split|trim|trimStart|trimEnd|padStart|padEnd|replace|replaceAll|substring|substr|normalize|localeCompare)\(/, reason: 'string algorithms live in src/runtime/text.ts', allowedIn: [...FRONT_END, 'src/runtime/text.ts', 'src/cli.ts', 'src/repl.ts'] },
  { pattern: /\.(toUpperCase|toLowerCase)\(/, reason: 'case mapping is only wrapped by src/runtime/text.ts', allowedIn: ['src/runtime/text.ts'] },
  { pattern: /\/\\p\{|\/\^\\s\$\/|\/\\s\//, reason: 'Unicode classification regexes are only in src/runtime/text.ts', allowedIn: ['src/runtime/text.ts'] },
  { pattern: /process\.exit\(/, reason: 'exit through ExitSignal so output is flushed', allowedIn: [] },
];

const sources = listSources(srcDir);

test('src/ contains the interpreter modules', () => {
  assert.ok(sources.length >= 10);
});

for (const rule of rules) {
  test(`src/ does not use ${rule.pattern} outside ${rule.allowedIn.length === 0 ? 'anywhere' : rule.allowedIn.join(', ')} (${rule.reason})`, () => {
    const offenders: string[] = [];
    for (const path of sources) {
      const relativePath = relative(root, path);
      if (rule.allowedIn.includes(relativePath)) continue;
      const lines = readFileSync(path, 'utf8').split('\n');
      lines.forEach((line, index) => {
        if (rule.pattern.test(line)) offenders.push(`${relativePath}:${index + 1}: ${line.trim()}`);
      });
    }
    assert.deepEqual(offenders, []);
  });
}
