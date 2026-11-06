import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SymbolKind, type DocumentSymbol } from 'vscode-languageserver/node';
import { documentSymbols } from '../src/outline.ts';

function outline(symbols: DocumentSymbol[], depth = 0): string[] {
  return symbols.flatMap((symbol) => {
    const kind = symbol.kind === SymbolKind.Function ? 'procedure' : symbol.kind === SymbolKind.Module ? 'module' : 'variable';
    const { range, selectionRange } = symbol;
    const shown = `${'  '.repeat(depth)}${kind} ${symbol.name}${symbol.detail ? ` (${symbol.detail})` : ''} ${range.start.line}:${range.start.character}-${range.end.line}:${range.end.character} at ${selectionRange.start.line}:${selectionRange.start.character}`;
    return [shown, ...outline(symbol.children ?? [], depth + 1)];
  });
}

const SOURCE = [
  '"./lib/geometry" -> use => geometry',
  '0 => total',
  '',
  'proc add-all xs',
  '| xs -> array/each n',
  '| | total + n =>> total',
  '| proc inner',
  '| | 1',
  '| total',
  '',
  '~ about the next one',
  '1 => total',
  'proc last',
  '| 2',
  '',
].join('\n');

test('the outline lists procedures with the procedures declared inside them, and the names the top level binds once each', () => {
  assert.deepEqual(outline(documentSymbols(SOURCE)), [
    'module geometry 0:27-0:35 at 0:27',
    'variable total 1:5-1:10 at 1:5',
    'procedure add-all (xs) 3:0-8:7 at 3:5',
    '  procedure inner 6:2-7:5 at 6:7',
    'procedure last 12:0-13:3 at 12:5',
  ]);
});

test('names bound inside procedures, lambdas or with =>> are not listed', () => {
  assert.deepEqual(outline(documentSymbols('proc f\n| 1 => local\n[1] -> array/each n\n| n => inner\n0 =>> total')), ['procedure f 0:0-1:12 at 0:5']);
});

test('a statement that does not parse is left out and the rest is still listed', () => {
  assert.deepEqual(outline(documentSymbols('proc broken +\n| 1\n1 => kept')), ['variable kept 2:5-2:9 at 2:5']);
});
