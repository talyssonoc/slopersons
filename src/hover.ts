import { MarkupKind, type Hover, type SignatureHelp } from 'vscode-languageserver/node';
import type { BuiltinDoc } from './builtin-docs.ts';
import { inCode, visibleBindings } from './completion.ts';
import { modulesOf, type DocumentContext, type ModuleMember, type ModulesOf } from './module-files.ts';
import { contains, memberRange, occurrenceAt } from './name-ranges.ts';
import { resolveNames, type Binding, type ModuleSource } from './names.ts';
import { parseRecovering } from './parser.ts';

function code(text: string): string {
  return `\`\`\`slopersons\n${text}\n\`\`\``;
}

function procedureLine(name: string, parameters: string[]): string {
  return ['proc', name, ...parameters].join(' ');
}

function builtinText(doc: BuiltinDoc): string {
  return doc.usage === '' ? doc.summary : `${code(doc.usage)}\n\n${doc.summary}`;
}

function bindingText(binding: Binding): string {
  if (binding.kind === 'procedure') return code(procedureLine(binding.name, binding.parameters ?? []));
  if (binding.module !== null) return `module \`${binding.name}\`, loaded from \`${binding.module.path}\``;
  return `${binding.kind} \`${binding.name}\``;
}

function memberText(module: ModuleSource, member: ModuleMember): string {
  const shown = member.kind === 'procedure' ? code(procedureLine(member.name, member.parameters ?? [])) : `${member.kind ?? 'name'} \`${member.name}\``;
  return `${shown}\n\nfrom \`${module.path}\``;
}

function builtinModuleText(name: string, doc: BuiltinDoc): string {
  return `builtin module \`${name}\`\n\n${doc.summary}`;
}

function memberDoc(moduleName: string, binding: Binding | null, member: string, context: DocumentContext, modules: ModulesOf): string | null {
  if (binding === null) {
    const doc = context.docs[`${moduleName}/${member}`];
    return doc === undefined ? null : builtinText(doc);
  }
  if (binding.module === null) return null;
  const found = modules(binding.module)?.find((candidate) => candidate.name === member);
  return found === undefined ? null : memberText(binding.module, found);
}

export function hoverAt(source: string, line: number, character: number, context: DocumentContext): Hover | null {
  const occurrences = resolveNames(parseRecovering(source).statements);
  const modules = modulesOf(context);
  const markdown = (value: string): Hover => ({ contents: { kind: MarkupKind.Markdown, value } });
  const occurrence = occurrenceAt(occurrences, line, character);
  if (occurrence !== undefined) {
    if (occurrence.binding !== null) return markdown(bindingText(occurrence.binding));
    const doc = context.docs[occurrence.name];
    if (doc === undefined) return null;
    const module = context.catalog.find((entry) => entry.name === occurrence.name)?.module ?? false;
    return markdown(module ? builtinModuleText(occurrence.name, doc) : builtinText(doc));
  }
  const qualified = occurrences.find((candidate) => candidate.members.length > 0 && contains(memberRange(candidate), line, character));
  const member = qualified?.members[0];
  if (qualified === undefined || member === undefined) return null;
  const text = memberDoc(qualified.name, qualified.binding, member, context, modules);
  return text === null ? null : { ...markdown(text), range: memberRange(qualified) };
}

interface Signature {
  label: string;
  parameters: Array<[number, number]>;
}

// Parameters are given as offsets into the label: a parameter's name may also occur inside an earlier word.
function signatureFrom(words: string[], firstParameter: number): Signature {
  const parameters: Array<[number, number]> = [];
  let offset = 0;
  words.forEach((word, index) => {
    if (index >= firstParameter) parameters.push([offset, offset + word.length]);
    offset += word.length + 1;
  });
  return { label: words.join(' '), parameters };
}

function usageSignature(usage: string, callee: string): Signature | null {
  const words = usage.split(' ');
  const at = words.indexOf(callee);
  return at === -1 ? null : signatureFrom(words, at + 1);
}

function procedureSignature(name: string, parameters: string[]): Signature {
  return signatureFrom(['proc', name, ...parameters], 3);
}

function signatureOf(callee: string, binding: Binding | null, context: DocumentContext, modules: ModulesOf): Signature | null {
  const [first = '', member] = callee.split('/');
  if (member === undefined) {
    if (binding !== null) return binding.kind === 'procedure' ? procedureSignature(binding.name, binding.parameters ?? []) : null;
    const doc = context.docs[first];
    return doc === undefined ? null : usageSignature(doc.usage, callee);
  }
  if (binding === null) {
    const doc = context.docs[callee];
    return doc === undefined ? null : usageSignature(doc.usage, callee);
  }
  const found = binding.module === null ? undefined : modules(binding.module)?.find((candidate) => candidate.name === member);
  if (found?.kind !== 'procedure') return null;
  return procedureSignature(found.name, found.parameters ?? []);
}

const CALL = /->\s*([A-Za-z][A-Za-z0-9]*(?:-[A-Za-z0-9]+)*(?:\/[A-Za-z][A-Za-z0-9]*(?:-[A-Za-z0-9]+)*)?)(\s[^]*)?$/;
const BINARY_OPERATORS = ['+', '-', '*', '/', 'mod', '=', '/=', '<', '>', '<=', '>=', 'and', 'or'];
const OPENERS = '([{';
const CLOSERS = ')]}';

function words(text: string): string[] {
  const found: string[] = [];
  let current = '';
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const character = text[i] ?? '';
    if (inString) {
      current += character;
      if (character === '\\') current += text[++i] ?? '';
      else if (character === '"') inString = false;
    } else if (character === '"') {
      inString = true;
      current += character;
    } else if (character === '`') {
      const length = text[i + 1] === '\\' ? 4 : 3;
      current += text.slice(i, i + length);
      i += length - 1;
    } else if (character === ' ' || character === '\t') {
      if (current !== '') found.push(current);
      current = '';
    } else {
      current += character;
    }
  }
  if (current !== '') found.push(current);
  return found;
}

// Counts the inputs typed after the callee: an input is a word at bracket depth 0 that does not continue
// an operator expression. Returns null once the call is over (a lambda bar, another step).
function inputsTyped(text: string): number | null {
  let inputs = 0;
  let depth = 0;
  let joined = false;
  for (const word of words(text)) {
    if (depth === 0 && (word === '|' || word === '->' || word === '=>' || word === '=>>')) return null;
    if (depth === 0 && BINARY_OPERATORS.includes(word)) {
      joined = true;
      continue;
    }
    if (depth === 0 && !joined) inputs++;
    joined = depth === 0 && word === 'not';
    for (const character of word) {
      if (OPENERS.includes(character)) depth++;
      else if (CLOSERS.includes(character)) depth = Math.max(depth - 1, 0);
    }
  }
  return inputs;
}

export function signatureAt(source: string, line: number, character: number, context: DocumentContext): SignatureHelp | null {
  const lines = source.split('\n');
  const before = (lines[line] ?? '').slice(0, character);
  if (!inCode(before)) return null;
  const call = CALL.exec(before);
  const callee = call?.[1];
  const rest = call?.[2];
  if (call === null || callee === undefined || rest === undefined) return null;
  const typed = inputsTyped(rest);
  if (typed === null) return null;
  const head = callee.split('/')[0] ?? callee;
  const binding = visibleBindings(lines, line, call.index + call[0].length - rest.length - callee.length, character).find((candidate) => candidate.name === head) ?? null;
  const signature = signatureOf(callee, binding, context, modulesOf(context));
  if (signature === null) return null;
  const active = /\s$/.test(rest) ? typed : Math.max(typed - 1, 0);
  return {
    signatures: [{ label: signature.label, parameters: signature.parameters.map((label) => ({ label })) }],
    activeSignature: 0,
    activeParameter: Math.min(active, Math.max(signature.parameters.length - 1, 0)),
  };
}
