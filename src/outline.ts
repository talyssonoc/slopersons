import { SymbolKind, type DocumentSymbol, type Range } from 'vscode-languageserver/node';
import type { Statement } from './ast.ts';
import type { Position } from './errors.ts';
import { occurrenceRange } from './name-ranges.ts';
import { parseRecovering } from './parser.ts';

function startOf(statement: Statement): Position {
  return statement.kind === 'flow-statement' ? statement.expression.position : statement.position;
}

const EMPTY_LINE = /^\s*(?:\|\s*)*(?:~.*)?$/;

function lastLineWithCode(lines: string[], from: number, notBefore: number): number {
  let line = from;
  while (line > notBefore && EMPTY_LINE.test(lines[line] ?? '')) line--;
  return line;
}

function bindingSymbols(statement: Statement, seen: string[]): DocumentSymbol[] {
  if (statement.kind !== 'flow-statement' || statement.expression.kind !== 'flow') return [];
  const flow = statement.expression;
  const loadsModule = flow.steps.some((step) => step.kind === 'call' && step.callee.kind === 'name' && step.callee.name === 'use');
  return flow.steps.flatMap((step) => {
    if (step.kind !== 'bind' || step.outer || seen.includes(step.name)) return [];
    seen.push(step.name);
    const range = occurrenceRange(step.namePosition, step.name);
    return [{ name: step.name, kind: loadsModule ? SymbolKind.Module : SymbolKind.Variable, range, selectionRange: range }];
  });
}

function symbolsOf(statements: Statement[], lines: string[], lastLine: number, topLevel: boolean): DocumentSymbol[] {
  const seen: string[] = [];
  return statements.flatMap((statement, index) => {
    if (statement.kind !== 'proc') return topLevel ? bindingSymbols(statement, seen) : [];
    const next = statements[index + 1];
    const start = startOf(statement);
    const end = lastLineWithCode(lines, next === undefined ? lastLine : startOf(next).line - 2, start.line - 1);
    const range: Range = { start: { line: start.line - 1, character: start.col - 1 }, end: { line: end, character: (lines[end] ?? '').length } };
    return [
      {
        name: statement.name,
        detail: statement.parameters.join(' '),
        kind: SymbolKind.Function,
        range,
        selectionRange: occurrenceRange(statement.namePosition, statement.name),
        children: symbolsOf(statement.body, lines, end, false),
      },
    ];
  });
}

// Procedures, with the procedures declared inside them, and the names the top level binds with `=>`.
export function documentSymbols(source: string): DocumentSymbol[] {
  const lines = source.split('\n');
  return symbolsOf(parseRecovering(source).statements, lines, lines.length - 1, true);
}
