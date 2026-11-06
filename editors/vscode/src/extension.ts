import { window, workspace } from 'vscode';
import { LanguageClient, TransportKind, type LanguageClientOptions, type ServerOptions } from 'vscode-languageclient/node';

let client: LanguageClient | undefined;

export async function activate(): Promise<void> {
  const command = workspace.getConfiguration('slopersons').get<string>('server.path', 'slopersons');
  const serverOptions: ServerOptions = { command, args: ['--lsp'], transport: TransportKind.stdio };
  const clientOptions: LanguageClientOptions = {
    documentSelector: [
      { scheme: 'file', language: 'slopersons' },
      { scheme: 'untitled', language: 'slopersons' },
    ],
  };
  const starting = new LanguageClient('slopersons', 'slopersons', serverOptions, clientOptions);
  try {
    await starting.start();
    client = starting;
  } catch {
    void window.showWarningMessage(`slopersons: could not start the language server with \`${command} --lsp\`. Highlighting still works; set \`slopersons.server.path\` to the slopersons executable to see parse errors.`);
  }
}

export async function deactivate(): Promise<void> {
  await client?.stop();
}
