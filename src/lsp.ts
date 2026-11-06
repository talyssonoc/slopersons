import { DiagnosticSeverity, TextDocumentSyncKind, TextDocuments, createConnection, type Connection, type Diagnostic, type Range } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import type { SlopersonsError } from './errors.ts';
import { parseRecovering } from './parser.ts';

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
    capabilities: { textDocumentSync: TextDocumentSyncKind.Full },
    serverInfo: { name: 'slopersons', version },
  }));
  documents.onDidChangeContent((change) => publishDiagnostics(connection, change.document));
  documents.onDidClose((event) => void connection.sendDiagnostics({ uri: event.document.uri, diagnostics: [] }));
  documents.listen(connection);
  connection.listen();
  return new Promise(() => {});
}
