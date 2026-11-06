import type { Range } from 'vscode-languageserver/node';
import type { Position } from './errors.ts';
import type { ModuleSource, Occurrence } from './names.ts';

export function occurrenceRange(position: Position, name: string): Range {
  const start = { line: position.line - 1, character: position.col - 1 };
  return { start, end: { line: start.line, character: start.character + name.length } };
}

export function contains(range: Range, line: number, character: number): boolean {
  return range.start.line === line && range.start.character <= character && character <= range.end.character;
}

export function occurrenceAt(occurrences: Occurrence[], line: number, character: number): Occurrence | undefined {
  return occurrences.find((occurrence) => contains(occurrenceRange(occurrence.position, occurrence.name), line, character));
}

export function memberRange(occurrence: Occurrence): Range {
  const start = { line: occurrence.position.line - 1, character: occurrence.position.col + occurrence.name.length };
  return { start, end: { line: start.line, character: start.character + (occurrence.members[0]?.length ?? 0) } };
}

export function moduleRange(module: ModuleSource): Range {
  const start = { line: module.position.line - 1, character: module.position.col - 1 };
  return { start, end: { line: start.line, character: start.character + module.length } };
}
