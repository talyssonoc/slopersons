import type { BuiltinDocs } from './builtin-docs.ts';
import type { BuiltinEntry } from './completion.ts';
import type { Position } from './errors.ts';
import { exportedNames, type ModuleSource, type NameKind } from './names.ts';
import { parseRecovering } from './parser.ts';

export type ReadDocument = (uri: string) => string | null;

export interface ModuleMember {
  name: string;
  kind: NameKind | null;
  uri: string;
  declaration: Position | null;
  parameters: string[] | null;
}

const EXTENSION = '.slop';

// The interpreter resolves a module path against the directory of the file that loads it and adds
// `.slop` when it is missing (src/modules.ts); resolving it as a URL relative to that file's URL does the same.
export function moduleUri(importer: string, path: string): string | null {
  const target = path.endsWith(EXTENSION) ? path : `${path}${EXTENSION}`;
  try {
    if (new URL(importer).protocol !== 'file:') return null;
    return new URL(target, importer).href;
  } catch {
    return null;
  }
}

export function filePath(uri: string): string {
  return decodeURIComponent(new URL(uri).pathname);
}

export function moduleMembers(uri: string, read: ReadDocument): ModuleMember[] | null {
  const text = read(uri);
  if (text === null) return null;
  return exportedNames(parseRecovering(text).statements).map((exported) => ({
    name: exported.name,
    kind: exported.binding?.kind ?? null,
    uri,
    declaration: exported.binding?.declaration ?? null,
    parameters: exported.binding?.parameters ?? null,
  }));
}

export interface DocumentContext {
  uri: string;
  catalog: BuiltinEntry[];
  read: ReadDocument;
  docs: BuiltinDocs;
}

export type ModulesOf = (module: ModuleSource) => ModuleMember[] | null;

export function modulesOf(context: DocumentContext): ModulesOf {
  const cache: Record<string, ModuleMember[] | null> = {};
  return (module) => {
    const uri = moduleUri(context.uri, module.path);
    if (uri === null) return null;
    if (!(uri in cache)) cache[uri] = moduleMembers(uri, context.read);
    return cache[uri] ?? null;
  };
}
