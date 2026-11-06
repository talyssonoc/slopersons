import {
  DiagnosticSeverity,
  DocumentHighlightKind,
  SemanticTokenModifiers,
  SemanticTokenTypes,
  TextDocumentSyncKind,
  TextDocuments,
  createConnection,
  type Connection,
  type Diagnostic,
  type DocumentHighlight,
  type Range,
  type SemanticTokensLegend,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import type { Expression, Lambda, Statement, Step } from './ast.ts';
import type { Position, SlopersonsError } from './errors.ts';
import { resolveNames, type Occurrence } from './names.ts';
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
  declaration: boolean;
}

const TOKEN_TYPES: SemanticTokenType[] = [SemanticTokenTypes.parameter, 'keyValueSeparator'];

export const SEMANTIC_TOKENS_LEGEND: SemanticTokensLegend = { tokenTypes: TOKEN_TYPES, tokenModifiers: [SemanticTokenModifiers.declaration] };

function tokenAt(position: Position, length: number, type: SemanticTokenType, declaration: boolean): SemanticToken {
  return { line: position.line - 1, character: position.col - 1, length, type, declaration };
}

function lambdaTokens(lambda: Lambda, tokens: SemanticToken[]): void {
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
        tokens.push(tokenAt(entry.colon, 1, 'keyValueSeparator', false));
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
  const { statements } = parseRecovering(source);
  statementsTokens(statements, tokens);
  for (const occurrence of resolveNames(statements)) {
    if (occurrence.binding?.kind === 'parameter') tokens.push(tokenAt(occurrence.position, occurrence.name.length, 'parameter', occurrence.role === 'declaration'));
  }
  return stableSort(tokens, (first, second) => first.line - second.line || first.character - second.character);
}

export function encodeSemanticTokens(tokens: SemanticToken[]): number[] {
  const data: number[] = [];
  let line = 0;
  let character = 0;
  for (const token of tokens) {
    const sameLine = token.line === line;
    data.push(token.line - line, sameLine ? token.character - character : token.character, token.length, TOKEN_TYPES.indexOf(token.type), token.declaration ? 1 : 0);
    line = token.line;
    character = token.character;
  }
  return data;
}

function occurrenceRange(position: Position, name: string): Range {
  const start = { line: position.line - 1, character: position.col - 1 };
  return { start, end: { line: start.line, character: start.character + name.length } };
}

function occurrenceAt(occurrences: Occurrence[], line: number, character: number): Occurrence | undefined {
  return occurrences.find((occurrence) => {
    const range = occurrenceRange(occurrence.position, occurrence.name);
    return range.start.line === line && range.start.character <= character && character <= range.end.character;
  });
}

function sameBindingAt(source: string, line: number, character: number): Occurrence[] {
  const occurrences = resolveNames(parseRecovering(source).statements);
  const binding = occurrenceAt(occurrences, line, character)?.binding;
  if (binding === null || binding === undefined) return [];
  return occurrences.filter((occurrence) => occurrence.binding === binding);
}

export function definitionAt(source: string, line: number, character: number): Range | null {
  const binding = occurrenceAt(resolveNames(parseRecovering(source).statements), line, character)?.binding;
  return binding === null || binding === undefined ? null : occurrenceRange(binding.declaration, binding.name);
}

export function referencesAt(source: string, line: number, character: number, includeDeclaration: boolean): Range[] {
  return sameBindingAt(source, line, character)
    .filter((occurrence) => includeDeclaration || occurrence.role !== 'declaration')
    .map((occurrence) => occurrenceRange(occurrence.position, occurrence.name));
}

export function highlightsAt(source: string, line: number, character: number): DocumentHighlight[] {
  return sameBindingAt(source, line, character).map((occurrence) => ({
    range: occurrenceRange(occurrence.position, occurrence.name),
    kind: occurrence.role === 'read' ? DocumentHighlightKind.Read : DocumentHighlightKind.Write,
  }));
}

function answer<Result>(connection: Connection, documents: TextDocuments<TextDocument>, uri: string, fallback: Result, compute: (source: string) => Result): Result {
  const document = documents.get(uri);
  if (document === undefined) return fallback;
  try {
    return compute(document.getText());
  } catch {
    connection.console.error(`internal error while reading ${uri}; this is a bug in slopersons, not in your program`);
    return fallback;
  }
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
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Full,
      semanticTokensProvider: { legend: SEMANTIC_TOKENS_LEGEND, full: true },
      definitionProvider: true,
      referencesProvider: true,
      documentHighlightProvider: true,
    },
    serverInfo: { name: 'slopersons', version },
  }));
  documents.onDidChangeContent((change) => publishDiagnostics(connection, change.document));
  connection.languages.semanticTokens.on(({ textDocument }) => answer(connection, documents, textDocument.uri, { data: [] }, (source) => ({ data: encodeSemanticTokens(semanticTokensFor(source)) })));
  connection.onDefinition(({ textDocument, position }) =>
    answer(connection, documents, textDocument.uri, null, (source) => {
      const range = definitionAt(source, position.line, position.character);
      return range === null ? null : { uri: textDocument.uri, range };
    }),
  );
  connection.onReferences(({ textDocument, position, context }) =>
    answer(connection, documents, textDocument.uri, [], (source) => referencesAt(source, position.line, position.character, context.includeDeclaration).map((range) => ({ uri: textDocument.uri, range }))),
  );
  connection.onDocumentHighlight(({ textDocument, position }) => answer(connection, documents, textDocument.uri, [], (source) => highlightsAt(source, position.line, position.character)));
  documents.onDidClose((event) => void connection.sendDiagnostics({ uri: event.document.uri, diagnostics: [] }));
  documents.listen(connection);
  connection.listen();
  return new Promise(() => {});
}
