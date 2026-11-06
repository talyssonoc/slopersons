import type { Range, TextEdit } from 'vscode-languageserver/node';
import { KEYWORDS } from './lexer.ts';
import { filePath, moduleUri, type ReadDocument } from './module-files.ts';
import { contains, memberRange, occurrenceAt, occurrenceRange } from './name-ranges.ts';
import { exportedNames, resolveNames, type Binding, type Occurrence } from './names.ts';
import { parseRecovering } from './parser.ts';

export interface RenameWorkspace {
  uri: string;
  read: ReadDocument;
  files: () => string[];
}

interface Home {
  uri: string;
  source: string;
  binding: Binding;
  occurrences: Occurrence[];
  exported: boolean;
}

export type RenameTarget = { range: Range; home: Home } | { error: string };

const NAME = /^[A-Za-z][A-Za-z0-9]*(?:-[A-Za-z0-9]+)*$/;
const NOT_DECLARED = 'only a name declared in a file of the program can be renamed';

function homeFor(uri: string, source: string, matches: (binding: Binding) => boolean): Home | { error: string } {
  const parsed = parseRecovering(source);
  const occurrences = resolveNames(parsed.statements);
  const binding = occurrences.find((occurrence) => occurrence.binding !== null && matches(occurrence.binding))?.binding;
  if (binding === null || binding === undefined) return { error: NOT_DECLARED };
  if (parsed.unparsedNames.has(binding.name)) return { error: `a statement that does not parse mentions \`${binding.name}\`; fix it first` };
  return {
    uri,
    source,
    binding,
    occurrences: occurrences.filter((occurrence) => occurrence.binding === binding),
    exported: exportedNames(parsed.statements).some((exported) => exported.binding?.declaration === binding.declaration),
  };
}

// The cursor is on a name declared in this file, or on the member part of `module/name` for a module
// loaded with `use`, whose declaration is in the module's file.
export function renameTargetAt(source: string, line: number, character: number, workspace: RenameWorkspace): RenameTarget {
  const occurrences = resolveNames(parseRecovering(source).statements);
  const occurrence = occurrenceAt(occurrences, line, character);
  if (occurrence !== undefined) {
    const declared = occurrence.binding;
    if (declared === null) return { error: NOT_DECLARED };
    const home = homeFor(workspace.uri, source, (binding) => binding.declaration.line === declared.declaration.line && binding.declaration.col === declared.declaration.col);
    return 'error' in home ? home : { range: occurrenceRange(occurrence.position, occurrence.name), home };
  }
  const qualified = occurrences.find((candidate) => candidate.members.length > 0 && contains(memberRange(candidate), line, character));
  const member = qualified?.members[0];
  const module = qualified?.binding?.module;
  if (qualified === undefined || member === undefined || module === null || module === undefined) return { error: NOT_DECLARED };
  const uri = moduleUri(workspace.uri, module.path);
  const text = uri === null ? null : workspace.read(uri);
  if (uri === null || text === null) return { error: `cannot read module "${module.path}"` };
  const exported = exportedNames(parseRecovering(text).statements).find((candidate) => candidate.name === member)?.binding;
  if (exported === null || exported === undefined) return { error: `module \`${qualified.name}\` has no exported name \`${member}\`` };
  const home = homeFor(uri, text, (binding) => binding.declaration.line === exported.declaration.line && binding.declaration.col === exported.declaration.col);
  return 'error' in home ? home : { range: memberRange(qualified), home };
}

function applied(source: string, edits: TextEdit[]): string {
  const lines = source.split('\n');
  for (const edit of [...edits].reverse()) {
    const text = lines[edit.range.start.line] ?? '';
    lines[edit.range.start.line] = text.slice(0, edit.range.start.character) + edit.newText + text.slice(edit.range.end.character);
  }
  return lines.join('\n');
}

// Each name in the program is described by what it refers to: the first occurrence of its binding, or a
// builtin. A rename is safe when this is the same before and after it. A rename never changes an unbound
// name, so which builtin it is cannot change.
function meanings(source: string): string[] {
  const occurrences = resolveNames(parseRecovering(source).statements);
  return occurrences.map((occurrence) => (occurrence.binding === null ? 'builtin' : `binding ${occurrences.findIndex((first) => first.binding === occurrence.binding)}`));
}

// Files that load the module refer to an exported name as `module/name`; every such member in the
// workspace is renamed with it. A file that does not parse could hide one, so it stops the rename.
function importerEdits(home: Home, newName: string, workspace: RenameWorkspace): { changes: Record<string, TextEdit[]> } | { error: string } {
  const changes: Record<string, TextEdit[]> = {};
  const oldName = home.binding.name;
  const seen: string[] = [];
  for (const uri of workspace.files()) {
    if (seen.includes(uri)) continue;
    seen.push(uri);
    const text = workspace.read(uri);
    if (text === null || !text.includes(`/${oldName}`)) continue;
    const parsed = parseRecovering(text);
    if (parsed.errors.length > 0) return { error: `${filePath(uri)} does not parse and may use \`/${oldName}\`; fix it first` };
    const edits = resolveNames(parsed.statements)
      .filter((occurrence) => occurrence.members[0] === oldName && occurrence.binding?.module && moduleUri(uri, occurrence.binding.module.path) === home.uri)
      .map((occurrence) => ({ range: memberRange(occurrence), newText: newName }));
    if (edits.length > 0) changes[uri] = edits;
  }
  return { changes };
}

export function renameAt(source: string, line: number, character: number, newName: string, workspace: RenameWorkspace): { changes: Record<string, TextEdit[]> } | { error: string } {
  const target = renameTargetAt(source, line, character, workspace);
  if ('error' in target) return target;
  const { home } = target;
  if (!NAME.test(newName) || KEYWORDS.has(newName)) return { error: `\`${newName}\` is not a name: a name is words of letters and digits joined by \`-\`, starting with a letter, and not a keyword` };
  const edits = home.occurrences.map((occurrence) => ({ range: occurrenceRange(occurrence.position, occurrence.name), newText: newName }));
  const before = meanings(home.source);
  const after = meanings(applied(home.source, edits));
  if (before.length !== after.length || before.some((meaning, index) => meaning !== after[index])) {
    const where = home.uri === workspace.uri ? 'this file' : filePath(home.uri);
    return { error: `renaming \`${home.binding.name}\` to \`${newName}\` would change what a name refers to in ${where}` };
  }
  if (!home.exported) return { changes: { [home.uri]: edits } };
  const importers = importerEdits(home, newName, workspace);
  if ('error' in importers) return importers;
  return { changes: { [home.uri]: edits, ...importers.changes } };
}
