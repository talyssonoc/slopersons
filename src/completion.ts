import { CompletionItemKind, type CompletionItem, type Range } from 'vscode-languageserver/node';
import type { Interpreter } from './interpreter.ts';
import { KEYWORDS } from './lexer.ts';
import type { ModuleMember } from './module-files.ts';
import { bindingsVisibleAt, type Binding, type ModuleSource } from './names.ts';
import { parseRecovering } from './parser.ts';

export interface BuiltinMember {
  name: string;
  procedure: boolean;
}

export interface BuiltinEntry {
  name: string;
  module: boolean;
  members: BuiltinMember[];
}

export interface CompletionContext {
  catalog: BuiltinEntry[];
  modules: (module: ModuleSource) => ModuleMember[] | null;
}

export function builtinCatalog(interpreter: Interpreter): BuiltinEntry[] {
  return interpreter.builtinNames().map((name) => {
    const value = interpreter.builtin(name);
    if (value?.type !== 'module') return { name, module: false, members: [] };
    const members = [...value.members.entries()].map(([member, memberValue]) => ({ name: member, procedure: memberValue.type === 'builtin' || memberValue.type === 'proc' }));
    return { name, module: true, members };
  });
}

const PROBE = 'slopersons-completion-probe';
const NAME_PREFIX = /[A-Za-z0-9-]*$/;
const MEMBER_PREFIX = /(?:^|[^A-Za-z0-9/-])([A-Za-z][A-Za-z0-9]*(?:-[A-Za-z0-9]+)*)\/([A-Za-z0-9-]*)$/;
const MARGIN = /^(?:\s*\|)*\s*/;

type Mode = 'code' | 'string' | 'interpolation' | 'brace';

function inCode(before: string): boolean {
  const modes: Mode[] = ['code'];
  for (let i = 0; i < before.length; i++) {
    const character = before[i];
    const mode = modes[modes.length - 1] ?? 'code';
    if (mode === 'string') {
      if (character === '\\') i++;
      else if (character === '"') modes.pop();
      else if (character === '{') modes.push('interpolation');
      continue;
    }
    if (character === '~' && mode === 'code') return false;
    if (character === '"') modes.push('string');
    else if (character === '`') i += before[i + 1] === '\\' ? 3 : 2;
    else if (character === '{') modes.push('brace');
    else if (character === '}' && mode !== 'code') modes.pop();
  }
  return modes[modes.length - 1] !== 'string';
}

function replaceLine(lines: string[], index: number, text: string): string {
  return lines.map((line, lineIndex) => (lineIndex === index ? text : line)).join('\n');
}

// While a line is typed its statement rarely parses, so the word under the cursor is replaced by a name
// that cannot be in the program and the scope is read where that name is used. If the line still does
// not parse, the rest of it is dropped, then all but its margin, and last the cursor is moved to the
// end of the file, where every top-level declaration is visible.
function visibleBindings(lines: string[], line: number, start: number, character: number): Binding[] {
  const text = lines[line] ?? '';
  const margin = MARGIN.exec(text)?.[0] ?? '';
  const attempts = [
    replaceLine(lines, line, text.slice(0, start) + PROBE + text.slice(character)),
    replaceLine(lines, line, text.slice(0, start) + PROBE),
    replaceLine(lines, line, margin + PROBE),
    `${replaceLine(lines, line, '')}\n${PROBE}`,
  ];
  for (const source of attempts) {
    const visible = bindingsVisibleAt(parseRecovering(source).statements, PROBE);
    if (visible !== null) return visible.filter((binding) => binding.name !== PROBE);
  }
  return [];
}

function item(label: string, kind: CompletionItemKind, detail: string, range: Range, rank: number): CompletionItem {
  return { label, kind, detail, sortText: `${rank}${label}`, textEdit: { range, newText: label } };
}

const BINDING_KINDS: Record<Binding['kind'], CompletionItemKind> = {
  procedure: CompletionItemKind.Function,
  parameter: CompletionItemKind.Variable,
  variable: CompletionItemKind.Variable,
};

function memberItems(moduleName: string, members: Array<{ name: string; procedure: boolean }>, range: Range): CompletionItem[] {
  return members.map((member) => item(member.name, member.procedure ? CompletionItemKind.Function : CompletionItemKind.Constant, `${moduleName}/${member.name}`, range, 0));
}

export function completionsAt(source: string, line: number, character: number, context: CompletionContext): CompletionItem[] {
  const { catalog } = context;
  const lines = source.split('\n');
  const before = (lines[line] ?? '').slice(0, character);
  if (!inCode(before)) return [];

  const member = MEMBER_PREFIX.exec(before);
  if (member !== null) {
    const [, moduleName = '', partial = ''] = member;
    const range = { start: { line, character: character - partial.length }, end: { line, character } };
    const binding = visibleBindings(lines, line, character - partial.length - moduleName.length - 1, character).find((candidate) => candidate.name === moduleName);
    if (binding === undefined) return memberItems(moduleName, catalog.find((candidate) => candidate.module && candidate.name === moduleName)?.members ?? [], range);
    const members = binding.module === null ? null : context.modules(binding.module);
    return memberItems(moduleName, (members ?? []).map((member) => ({ name: member.name, procedure: member.kind === 'procedure' })), range);
  }
  if (before.endsWith('/')) return [];

  const prefix = NAME_PREFIX.exec(before)?.[0] ?? '';
  if (/^[0-9]/.test(prefix)) return [];
  const start = character - prefix.length;
  const range = { start: { line, character: start }, end: { line, character } };
  const bindings = visibleBindings(lines, line, start, character);
  const bound = bindings.map((binding) => binding.name);
  return [
    ...bindings.map((binding) => item(binding.name, BINDING_KINDS[binding.kind], binding.kind, range, 0)),
    ...catalog
      .filter((entry) => !bound.includes(entry.name))
      .map((entry) => item(entry.name, entry.module ? CompletionItemKind.Module : CompletionItemKind.Function, entry.module ? 'builtin module' : 'builtin', range, 1)),
    ...[...KEYWORDS].map((keyword) => item(keyword, CompletionItemKind.Keyword, 'keyword', range, 2)),
  ];
}
