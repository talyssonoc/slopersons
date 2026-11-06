import {
  DiagnosticSeverity,
  SemanticTokenModifiers,
  SemanticTokenTypes,
  TextDocumentSyncKind,
  TextDocuments,
  createConnection,
  type Connection,
  type Diagnostic,
  type Range,
  type SemanticTokensLegend,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import type { Expression, Lambda, Statement, Step } from './ast.ts';
import type { Position, SlopersonsError } from './errors.ts';
import { parseRecovering } from './parser.ts';
import { stableSort } from './runtime/sorting.ts';

const NAME_CHARACTER = /[A-Za-z0-9/-]/;

function rangeOf(error: SlopersonsError, lines: string[]): Range {
  if (error.position === null) {
    return { start: { line: 0, character: 0 }, end: { line: 0, character: lines[0]?.length ?? 0 } };
  }
  const line = Math.min(error.position.line - 1, lines.length - 1);
  const text = lines[line] ?? '';
  const start = error.position.col - 1;
  if (start >= text.length) {
    return { start: { line, character: Math.max(text.length - 1, 0) }, end: { line, character: text.length } };
  }
  let end = start + String.fromCodePoint(text.codePointAt(start) ?? 0).length;
  if (NAME_CHARACTER.test(text[start] ?? '')) {
    while (end < text.length && NAME_CHARACTER.test(text[end] ?? '')) end++;
  }
  return { start: { line, character: start }, end: { line, character: end } };
}

export function diagnosticsFor(source: string): Diagnostic[] {
  const lines = source.split('\n');
  return parseRecovering(source).errors.map((error) => ({
    range: rangeOf(error, lines),
    severity: DiagnosticSeverity.Error,
    source: 'slopersons',
    message: error.message,
  }));
}

export type SemanticTokenType = 'parameter' | 'keyValueSeparator';

export interface SemanticToken {
  line: number;
  character: number;
  length: number;
  type: SemanticTokenType;
}

const TOKEN_TYPES: SemanticTokenType[] = [SemanticTokenTypes.parameter, 'keyValueSeparator'];

export const SEMANTIC_TOKENS_LEGEND: SemanticTokensLegend = { tokenTypes: TOKEN_TYPES, tokenModifiers: [SemanticTokenModifiers.declaration] };

function tokenAt(position: Position, length: number, type: SemanticTokenType): SemanticToken {
  return { line: position.line - 1, character: position.col - 1, length, type };
}

function lambdaTokens(lambda: Lambda, tokens: SemanticToken[]): void {
  lambda.parameters.forEach((name, index) => {
    const position = lambda.parameterPositions[index];
    if (position !== undefined) tokens.push(tokenAt(position, name.length, 'parameter'));
  });
  statementsTokens(lambda.body, tokens);
}

function statementsTokens(statements: Statement[] | null, tokens: SemanticToken[]): void {
  for (const statement of statements ?? []) statementTokens(statement, tokens);
}

function statementTokens(statement: Statement, tokens: SemanticToken[]): void {
  switch (statement.kind) {
    case 'proc':
      statementsTokens(statement.body, tokens);
      return;
    case 'while':
      expressionTokens(statement.condition, tokens);
      statementsTokens(statement.body, tokens);
      return;
    case 'flow-statement':
      expressionTokens(statement.expression, tokens);
      return;
    case 'conditional':
    case 'attempt':
      expressionTokens(statement, tokens);
      return;
    case 'stop':
    case 'export':
      return;
    default:
      return statement satisfies never;
  }
}

function stepTokens(step: Step, tokens: SemanticToken[]): void {
  if (step.kind === 'bind') return;
  expressionTokens(step.callee, tokens);
  for (const input of step.arguments) expressionTokens(input, tokens);
  if (step.body !== null) lambdaTokens(step.body, tokens);
}

function expressionTokens(expression: Expression, tokens: SemanticToken[]): void {
  switch (expression.kind) {
    case 'int':
    case 'float':
    case 'string':
    case 'char':
    case 'boolean':
    case 'nothing':
    case 'name':
    case 'qualified':
      return;
    case 'interpolation':
      for (const part of expression.parts) if (typeof part !== 'string') expressionTokens(part, tokens);
      return;
    case 'array':
      for (const item of expression.items) expressionTokens(item, tokens);
      return;
    case 'map':
      for (const entry of expression.entries) {
        expressionTokens(entry.key, tokens);
        tokens.push(tokenAt(entry.colon, 1, 'keyValueSeparator'));
        expressionTokens(entry.value, tokens);
      }
      return;
    case 'binary':
      expressionTokens(expression.left, tokens);
      expressionTokens(expression.right, tokens);
      return;
    case 'unary':
      expressionTokens(expression.operand, tokens);
      return;
    case 'flow':
      expressionTokens(expression.head, tokens);
      for (const step of expression.steps) stepTokens(step, tokens);
      return;
    case 'lambda':
      lambdaTokens(expression, tokens);
      return;
    case 'conditional':
      for (const branch of expression.branches) {
        expressionTokens(branch.condition, tokens);
        statementsTokens(branch.body, tokens);
      }
      statementsTokens(expression.otherwise, tokens);
      return;
    case 'attempt':
      statementsTokens(expression.body, tokens);
      statementsTokens(expression.handler, tokens);
      statementsTokens(expression.cleanup, tokens);
      return;
    default:
      return expression satisfies never;
  }
}

export function semanticTokensFor(source: string): SemanticToken[] {
  const tokens: SemanticToken[] = [];
  statementsTokens(parseRecovering(source).statements, tokens);
  return stableSort(tokens, (first, second) => first.line - second.line || first.character - second.character);
}

export function encodeSemanticTokens(tokens: SemanticToken[]): number[] {
  const data: number[] = [];
  let line = 0;
  let character = 0;
  for (const token of tokens) {
    const sameLine = token.line === line;
    data.push(token.line - line, sameLine ? token.character - character : token.character, token.length, TOKEN_TYPES.indexOf(token.type), token.type === 'parameter' ? 1 : 0);
    line = token.line;
    character = token.character;
  }
  return data;
}

function publishDiagnostics(connection: Connection, document: TextDocument): void {
  let diagnostics: Diagnostic[];
  try {
    diagnostics = diagnosticsFor(document.getText());
  } catch {
    connection.console.error(`internal error while checking ${document.uri}; this is a bug in slopersons, not in your program`);
    diagnostics = [];
  }
  void connection.sendDiagnostics({ uri: document.uri, diagnostics });
}

// The library ends the process itself: on the protocol's `exit` notification, when standard input
// closes, and when the editor that started it is gone. So the returned promise never settles.
export function runLanguageServer(version: string): Promise<number> {
  const connection = createConnection(process.stdin, process.stdout);
  const documents = new TextDocuments(TextDocument);
  connection.onInitialize(() => ({
    capabilities: { textDocumentSync: TextDocumentSyncKind.Full, semanticTokensProvider: { legend: SEMANTIC_TOKENS_LEGEND, full: true } },
    serverInfo: { name: 'slopersons', version },
  }));
  documents.onDidChangeContent((change) => publishDiagnostics(connection, change.document));
  connection.languages.semanticTokens.on((parameters) => {
    const document = documents.get(parameters.textDocument.uri);
    if (document === undefined) return { data: [] };
    try {
      return { data: encodeSemanticTokens(semanticTokensFor(document.getText())) };
    } catch {
      connection.console.error(`internal error while highlighting ${document.uri}; this is a bug in slopersons, not in your program`);
      return { data: [] };
    }
  });
  documents.onDidClose((event) => void connection.sendDiagnostics({ uri: event.document.uri, diagnostics: [] }));
  documents.listen(connection);
  connection.listen();
  return new Promise(() => {});
}
