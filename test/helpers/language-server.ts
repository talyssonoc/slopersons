import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { StreamMessageReader, StreamMessageWriter, createMessageConnection, type MessageConnection } from 'vscode-jsonrpc/node';

interface PublishedDiagnostics {
  uri: string;
  diagnostics: Array<{ message: string; severity: number; range: { start: { line: number; character: number } } }>;
}

interface Session {
  child: ChildProcessWithoutNullStreams;
  connection: MessageConnection;
  exited: Promise<number | null>;
  nextPublished: () => Promise<PublishedDiagnostics>;
  dispose: () => void;
  errorOutput: () => string;
}

function startSession(command: string[]): Session {
  const [executable, ...inputs] = command;
  if (executable === undefined) throw new Error('no command to start the language server');
  const child = spawn(executable, [...inputs, '--lsp', '--stdio'], { stdio: 'pipe' });
  const connection = createMessageConnection(new StreamMessageReader(child.stdout), new StreamMessageWriter(child.stdin));
  let errorOutput = '';
  child.stderr.on('data', (chunk: Buffer) => {
    errorOutput += chunk.toString();
  });
  let disposed = false;
  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    connection.dispose();
  };
  const exited = new Promise<number | null>((resolve) =>
    child.on('exit', (code) => {
      dispose();
      resolve(code);
    }),
  );
  const published: PublishedDiagnostics[] = [];
  const waiting: Array<(value: PublishedDiagnostics) => void> = [];
  connection.onNotification('textDocument/publishDiagnostics', (parameters: PublishedDiagnostics) => {
    const resolve = waiting.shift();
    if (resolve === undefined) published.push(parameters);
    else resolve(parameters);
  });
  connection.listen();
  const nextPublished = (): Promise<PublishedDiagnostics> => {
    const ready = published.shift();
    return ready === undefined ? new Promise((resolve) => waiting.push(resolve)) : Promise.resolve(ready);
  };
  return { child, connection, exited, nextPublished, dispose, errorOutput: () => errorOutput };
}

async function withSession(command: string[], body: (session: Session) => Promise<void>): Promise<void> {
  const session = startSession(command);
  try {
    await body(session);
  } catch (error) {
    const exitCode = session.child.exitCode;
    if (exitCode === null) throw error;
    throw new Error(`the language server exited with ${exitCode}; standard error: ${JSON.stringify(session.errorOutput())}`, { cause: error });
  } finally {
    session.dispose();
    session.child.kill('SIGKILL');
  }
}

const INITIALIZE = { processId: process.pid, rootUri: null, capabilities: {} };
const examples = join(fileURLToPath(new URL('../..', import.meta.url)), 'docs/examples');

async function publishedFor(nextPublished: () => Promise<PublishedDiagnostics>, uri: string): Promise<PublishedDiagnostics> {
  while (true) {
    const published = await nextPublished();
    if (published.uri === uri) return published;
  }
}

export function defineLanguageServerTests(prefix: string, command: () => string[]): void {
  test(`${prefix}the language server publishes diagnostics as a document opens, changes and closes, then exits cleanly`, { timeout: 30_000 }, () =>
    withSession(command(), async ({ connection, exited, nextPublished }) => {
      const initialized = await connection.sendRequest<{
        capabilities: {
          textDocumentSync: number;
          semanticTokensProvider: { legend: { tokenTypes: string[]; tokenModifiers: string[] }; full: boolean };
          definitionProvider: boolean;
          referencesProvider: boolean;
          documentHighlightProvider: boolean;
          completionProvider: { triggerCharacters: string[] };
          hoverProvider: boolean;
          signatureHelpProvider: { triggerCharacters: string[] };
        };
        serverInfo: { name: string };
      }>('initialize', INITIALIZE);
      assert.equal(initialized.capabilities.textDocumentSync, 1);
      assert.deepEqual(initialized.capabilities.semanticTokensProvider, { legend: { tokenTypes: ['parameter', 'keyValueSeparator'], tokenModifiers: ['declaration'] }, full: true });
      assert.deepEqual([initialized.capabilities.definitionProvider, initialized.capabilities.referencesProvider, initialized.capabilities.documentHighlightProvider], [true, true, true]);
      assert.deepEqual(initialized.capabilities.completionProvider.triggerCharacters, ['/']);
      assert.equal(initialized.capabilities.hoverProvider, true);
      assert.deepEqual(initialized.capabilities.signatureHelpProvider.triggerCharacters, [' ']);
      assert.equal(initialized.serverInfo.name, 'slopersons');
      await connection.sendNotification('initialized', {});

      const uri = 'file:///example.slop';
      await connection.sendNotification('textDocument/didOpen', { textDocument: { uri, languageId: 'slopersons', version: 1, text: '1 +\n2 => y\nx ->' } });
      const opened = await nextPublished();
      assert.equal(opened.uri, uri);
      assert.deepEqual(
        opened.diagnostics.map((diagnostic) => [diagnostic.range.start.line, diagnostic.message]),
        [
          [0, 'expected a value, found end of line'],
          [2, 'expected a procedure name after `->`, found end of line'],
        ],
      );

      await connection.sendNotification('textDocument/didChange', { textDocument: { uri, version: 2 }, contentChanges: [{ text: '1 + 2\n{"a": 1} => y\ny -> io/print-line' }] });
      assert.deepEqual((await nextPublished()).diagnostics, []);
      assert.deepEqual(await connection.sendRequest('textDocument/semanticTokens/full', { textDocument: { uri } }), { data: [1, 4, 1, 1, 0] });
      const declaration = { start: { line: 1, character: 12 }, end: { line: 1, character: 13 } };
      const use = { start: { line: 2, character: 0 }, end: { line: 2, character: 1 } };
      const onUse = { textDocument: { uri }, position: { line: 2, character: 0 } };
      assert.deepEqual(await connection.sendRequest('textDocument/definition', onUse), { uri, range: declaration });
      assert.deepEqual(await connection.sendRequest('textDocument/references', { ...onUse, context: { includeDeclaration: true } }), [
        { uri, range: declaration },
        { uri, range: use },
      ]);
      const hover = await connection.sendRequest<{ contents: { value: string } }>('textDocument/hover', { textDocument: { uri }, position: { line: 2, character: 12 } });
      assert.match(hover.contents.value, /^```slopersons\nvalue -> io\/print-line\n```\n\nWrites /);
      const help = await connection.sendRequest<{ signatures: Array<{ label: string }> }>('textDocument/signatureHelp', { textDocument: { uri }, position: { line: 2, character: 4 } });
      assert.equal(help, null);
      const names = await connection.sendRequest<Array<{ label: string }>>('textDocument/completion', onUse);
      assert.ok(['y', 'io', 'proc'].every((label) => names.some((item) => item.label === label)));
      const members = await connection.sendRequest<Array<{ label: string }>>('textDocument/completion', { textDocument: { uri }, position: { line: 2, character: 10 } });
      assert.ok(members.some((item) => item.label === 'print-line'));
      assert.ok(!members.some((item) => item.label === 'y'));
      assert.deepEqual(await connection.sendRequest('textDocument/documentHighlight', onUse), [
        { range: declaration, kind: 3 },
        { range: use, kind: 2 },
      ]);

      await connection.sendNotification('textDocument/didChange', { textDocument: { uri, version: 3 }, contentChanges: [{ text: 'proc\ntotl -> io/print-line' }] });
      const broken = await nextPublished();
      assert.deepEqual(
        broken.diagnostics.map((diagnostic) => [diagnostic.severity, diagnostic.message]),
        [
          [1, 'expected a procedure name after `proc`'],
          [2, 'unknown name `totl`'],
        ],
      );

      await connection.sendNotification('textDocument/didClose', { textDocument: { uri } });
      assert.deepEqual(await nextPublished(), { uri, diagnostics: [] });

      await connection.sendRequest('shutdown');
      await connection.sendNotification('exit');
      assert.equal(await exited, 0);
    }),
  );

  test(`${prefix}the language server follows use into a module file on disk, and prefers the editor's copy once it is open`, { timeout: 30_000 }, () =>
    withSession(command(), async ({ connection, nextPublished }) => {
      await connection.sendRequest('initialize', INITIALIZE);
      await connection.sendNotification('initialized', {});
      const shapesPath = join(examples, 'shapes.slop');
      const geometryPath = join(examples, 'lib/geometry.slop');
      const shapes = pathToFileURL(shapesPath).href;
      const geometry = pathToFileURL(geometryPath).href;

      await connection.sendNotification('textDocument/didOpen', { textDocument: { uri: shapes, languageId: 'slopersons', version: 1, text: readFileSync(shapesPath, 'utf8') } });
      assert.deepEqual(
        (await publishedFor(nextPublished, shapes)).diagnostics.map((diagnostic) => diagnostic.message),
        ['module `geometry` has no exported name `secret`'],
      );
      assert.deepEqual(await connection.sendRequest('textDocument/definition', { textDocument: { uri: shapes }, position: { line: 3, character: 17 } }), {
        uri: geometry,
        range: { start: { line: 3, character: 5 }, end: { line: 3, character: 16 } },
      });

      const exportingSecret = readFileSync(geometryPath, 'utf8').replace('export pi circle-area square-area describe', 'export pi circle-area square-area describe secret');
      await connection.sendNotification('textDocument/didOpen', { textDocument: { uri: geometry, languageId: 'slopersons', version: 1, text: exportingSecret } });
      assert.deepEqual((await publishedFor(nextPublished, shapes)).diagnostics, []);
    }),
  );

  test(`${prefix}the language server exits with 1 when its standard input closes without a shutdown`, { timeout: 30_000 }, () =>
    withSession(command(), async ({ child, connection, exited }) => {
      await connection.sendRequest('initialize', INITIALIZE);
      child.stdin.end();
      assert.equal(await exited, 1);
    }),
  );
}
