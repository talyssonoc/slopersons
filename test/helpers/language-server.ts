import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { StreamMessageReader, StreamMessageWriter, createMessageConnection, type MessageConnection } from 'vscode-jsonrpc/node';

interface PublishedDiagnostics {
  uri: string;
  diagnostics: Array<{ message: string; range: { start: { line: number; character: number } } }>;
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

export function defineLanguageServerTests(prefix: string, command: () => string[]): void {
  test(`${prefix}the language server publishes diagnostics as a document opens, changes and closes, then exits cleanly`, { timeout: 30_000 }, () =>
    withSession(command(), async ({ connection, exited, nextPublished }) => {
      const initialized = await connection.sendRequest<{
        capabilities: { textDocumentSync: number; semanticTokensProvider: { legend: { tokenTypes: string[]; tokenModifiers: string[] }; full: boolean } };
        serverInfo: { name: string };
      }>('initialize', INITIALIZE);
      assert.equal(initialized.capabilities.textDocumentSync, 1);
      assert.deepEqual(initialized.capabilities.semanticTokensProvider, { legend: { tokenTypes: ['parameter', 'keyValueSeparator'], tokenModifiers: ['declaration'] }, full: true });
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

      await connection.sendNotification('textDocument/didChange', { textDocument: { uri, version: 2 }, contentChanges: [{ text: '1 + 2\n{"a": 1} => y' }] });
      assert.deepEqual((await nextPublished()).diagnostics, []);
      assert.deepEqual(await connection.sendRequest('textDocument/semanticTokens/full', { textDocument: { uri } }), { data: [1, 4, 1, 1, 0] });

      await connection.sendNotification('textDocument/didChange', { textDocument: { uri, version: 3 }, contentChanges: [{ text: 'proc' }] });
      assert.equal((await nextPublished()).diagnostics.length, 1);

      await connection.sendNotification('textDocument/didClose', { textDocument: { uri } });
      assert.deepEqual(await nextPublished(), { uri, diagnostics: [] });

      await connection.sendRequest('shutdown');
      await connection.sendNotification('exit');
      assert.equal(await exited, 0);
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
