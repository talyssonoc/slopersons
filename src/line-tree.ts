import { parseError, type Position } from './errors.ts';
import type { LexedLine, Token } from './lexer.ts';

export interface Line {
  tokens: Token[];
  position: Position;
  endPosition: Position;
  children: Line[];
}

export function buildLineTree(lines: LexedLine[]): Line[] {
  const roots: Line[] = [];
  const stack: Line[] = [];
  for (const lexedLine of lines) {
    const line: Line = { tokens: lexedLine.tokens, position: lexedLine.position, endPosition: lexedLine.endPosition, children: [] };
    if (lexedLine.depth > stack.length) {
      const message = stack.length === 0 ? 'block without a header line above it' : 'block is nested deeper than the line above it allows';
      throw parseError(message, lexedLine.position);
    }
    stack.length = lexedLine.depth;
    const parent = stack[lexedLine.depth - 1];
    if (lexedLine.depth === 0) {
      roots.push(line);
    } else if (parent === undefined) {
      throw parseError('block without a header line', lexedLine.position);
    } else {
      parent.children.push(line);
    }
    stack.push(line);
  }
  return roots;
}
