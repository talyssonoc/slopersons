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
  type Location,
  type Range,
  type SemanticTokensLegend,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import type { Expression, Lambda, Statement, Step } from './ast.ts';
import { builtinCatalog, completionsAt, type BuiltinEntry } from './completion.ts';
import type { Position, SlopersonsError } from './errors.ts';
import type { Interpreter } from './interpreter.ts';
import { filePath, moduleUri, modulesOf, type DocumentContext, type ModulesOf, type ReadDocument } from './module-files.ts';
import { contains, memberRange, moduleRange, occurrenceAt, occurrenceRange } from './name-ranges.ts';
import { resolveNames, type Occurrence } from './names.ts';
import { hoverAt, signatureAt } from './hover.ts';
import { parseBuiltinDocs } from './builtin-docs.ts';
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

function unknownNameMessage(occurrence: Occurrence): string {
  return occurrence.role === 'write' ? `\`=>> ${occurrence.name}\` found no existing binding named \`${occurrence.name}\`` : `unknown name \`${occurrence.name}\``;
}

function warning(range: Range, message: string): Diagnostic {
  return { range, severity: DiagnosticSeverity.Warning, source: 'slopersons', message };
}

function memberWarnings(occurrences: Occurrence[], unparsedNames: Set<string>, catalog: BuiltinEntry[], modules: ModulesOf): Diagnostic[] {
  return occurrences.flatMap((occurrence) => {
    const member = occurrence.members[0];
    if (member === undefined) return [];
    let members: string[] | null = null;
    if (occurrence.binding === null && !unparsedNames.has(occurrence.name)) {
      members = catalog.find((entry) => entry.module && entry.name === occurrence.name)?.members.map((candidate) => candidate.name) ?? null;
    } else if (occurrence.binding?.module) {
      members = modules(occurrence.binding.module)?.map((candidate) => candidate.name) ?? null;
    }
    if (members === null || members.includes(member)) return [];
    return [warning(memberRange(occurrence), `module \`${occurrence.name}\` has no exported name \`${member}\``)];
  });
}

function unreadableModuleWarnings(occurrences: Occurrence[], context: DocumentContext, modules: ModulesOf): Diagnostic[] {
  return occurrences.flatMap((occurrence) => {
    const module = occurrence.role === 'declaration' ? occurrence.binding?.module : null;
    if (module === null || module === undefined) return [];
    const uri = moduleUri(context.uri, module.path);
    if (uri === null || modules(module) !== null) return [];
    return [warning(moduleRange(module), `cannot read module "${module.path}" (looked for ${filePath(uri)})`)];
  });
}

// A name that appears in a statement that does not parse may be declared there, so it is not reported.
// `=>>` updates only bindings the program made, never a builtin.
export function diagnosticsFor(source: string, context: DocumentContext): Diagnostic[] {
  const builtins = context.catalog.map((entry) => entry.name);
  const modules = modulesOf(context);
  const lines = source.split('\n');
  const parsed = parseRecovering(source);
  const occurrences = resolveNames(parsed.statements);
  const errors: Diagnostic[] = parsed.errors.map((error) => ({
    range: rangeOf(error, lines),
    severity: DiagnosticSeverity.Error,
    source: 'slopersons',
    message: error.message,
  }));
  const unknownNames: Diagnostic[] = occurrences
    .filter((occurrence) => occurrence.binding === null && !parsed.unparsedNames.has(occurrence.name) && (occurrence.role === 'write' || !builtins.includes(occurrence.name)))
    .map((occurrence) => warning(occurrenceRange(occurrence.position, occurrence.name), unknownNameMessage(occurrence)));
  const warnings = [...unknownNames, ...memberWarnings(occurrences, parsed.unparsedNames, context.catalog, modules), ...unreadableModuleWarnings(occurrences, context, modules)];
  return stableSort([...errors, ...warnings], (first, second) => first.range.start.line - second.range.start.line || first.range.start.character - second.range.start.character);
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

function sameBindingAt(source: string, line: number, character: number): Occurrence[] {
  const occurrences = resolveNames(parseRecovering(source).statements);
  const binding = occurrenceAt(occurrences, line, character)?.binding;
  if (binding === null || binding === undefined) return [];
  return occurrences.filter((occurrence) => occurrence.binding === binding);
}

export function definitionAt(source: string, line: number, character: number, context: DocumentContext): Location | null {
  const occurrences = resolveNames(parseRecovering(source).statements);
  const binding = occurrenceAt(occurrences, line, character)?.binding;
  if (binding !== null && binding !== undefined) return { uri: context.uri, range: occurrenceRange(binding.declaration, binding.name) };
  const modules = modulesOf(context);
  const loading = occurrences.find((occurrence) => occurrence.role === 'declaration' && occurrence.binding?.module && contains(moduleRange(occurrence.binding.module), line, character));
  if (loading?.binding?.module) {
    const uri = moduleUri(context.uri, loading.binding.module.path);
    const start = { line: 0, character: 0 };
    return uri === null || modules(loading.binding.module) === null ? null : { uri, range: { start, end: start } };
  }
  const qualified = occurrences.find((occurrence) => occurrence.members.length > 0 && contains(memberRange(occurrence), line, character));
  const module = qualified?.binding?.module;
  if (qualified === undefined || module === null || module === undefined) return null;
  const member = modules(module)?.find((candidate) => candidate.name === qualified.members[0]);
  if (member === undefined || member.declaration === null) return null;
  return { uri: member.uri, range: occurrenceRange(member.declaration, member.name) };
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

function publishDiagnostics(connection: Connection, document: TextDocument, context: DocumentContext): void {
  let diagnostics: Diagnostic[];
  try {
    diagnostics = diagnosticsFor(document.getText(), context);
  } catch {
    connection.console.error(`internal error while checking ${document.uri}; this is a bug in slopersons, not in your program`);
    diagnostics = [];
  }
  void connection.sendDiagnostics({ uri: document.uri, diagnostics });
}

// The library ends the process itself: on the protocol's `exit` notification, when standard input
// closes, and when the editor that started it is gone. So the returned promise never settles.
export function runLanguageServer(version: string, interpreter: Interpreter, readFile: (path: string) => string | null, documentation: Record<string, string>): Promise<number> {
  const catalog = builtinCatalog(interpreter);
  const docs = parseBuiltinDocs(documentation);
  const connection = createConnection(process.stdin, process.stdout);
  const documents = new TextDocuments(TextDocument);
  const read: ReadDocument = (uri) => {
    const open = documents.get(uri);
    return open === undefined ? readFile(filePath(uri)) : open.getText();
  };
  const contextOf = (uri: string): DocumentContext => ({ uri, catalog, read, docs });
  connection.onInitialize(() => ({
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Full,
      semanticTokensProvider: { legend: SEMANTIC_TOKENS_LEGEND, full: true },
      definitionProvider: true,
      referencesProvider: true,
      documentHighlightProvider: true,
      completionProvider: { triggerCharacters: ['/'] },
      hoverProvider: true,
      signatureHelpProvider: { triggerCharacters: [' '], retriggerCharacters: [' '] },
    },
    serverInfo: { name: 'slopersons', version },
  }));
  documents.onDidChangeContent(() => {
    for (const document of documents.all()) publishDiagnostics(connection, document, contextOf(document.uri));
  });
  connection.languages.semanticTokens.on(({ textDocument }) => answer(connection, documents, textDocument.uri, { data: [] }, (source) => ({ data: encodeSemanticTokens(semanticTokensFor(source)) })));
  connection.onDefinition(({ textDocument, position }) =>
    answer(connection, documents, textDocument.uri, null, (source) => definitionAt(source, position.line, position.character, contextOf(textDocument.uri))),
  );
  connection.onReferences(({ textDocument, position, context }) =>
    answer(connection, documents, textDocument.uri, [], (source) => referencesAt(source, position.line, position.character, context.includeDeclaration).map((range) => ({ uri: textDocument.uri, range }))),
  );
  connection.onCompletion(({ textDocument, position }) => answer(connection, documents, textDocument.uri, [], (source) => completionsAt(source, position.line, position.character, { catalog, modules: modulesOf(contextOf(textDocument.uri)) })));
  connection.onHover(({ textDocument, position }) => answer(connection, documents, textDocument.uri, null, (source) => hoverAt(source, position.line, position.character, contextOf(textDocument.uri))));
  connection.onSignatureHelp(({ textDocument, position }) => answer(connection, documents, textDocument.uri, null, (source) => signatureAt(source, position.line, position.character, contextOf(textDocument.uri))));
  connection.onDocumentHighlight(({ textDocument, position }) => answer(connection, documents, textDocument.uri, [], (source) => highlightsAt(source, position.line, position.character)));
  documents.onDidClose((event) => void connection.sendDiagnostics({ uri: event.document.uri, diagnostics: [] }));
  documents.listen(connection);
  connection.listen();
  return new Promise(() => {});
}
