import { parseError, type Pos } from './errors.ts';
import type { LexedLine, Token } from './lexer.ts';

export interface Line {
  tokens: Token[];
  pos: Pos;
  endPos: Pos;
  children: Line[];
}

export function buildLineTree(lines: LexedLine[]): Line[] {
  const roots: Line[] = [];
  const stack: Line[] = [];
  for (const lexed of lines) {
    const line: Line = { tokens: lexed.tokens, pos: lexed.pos, endPos: lexed.endPos, children: [] };
    if (lexed.depth > stack.length) {
      const message = stack.length === 0 ? 'block without a header line above it' : 'block is nested deeper than the line above it allows';
      throw parseError(message, lexed.pos);
    }
    stack.length = lexed.depth;
    const parent = stack[lexed.depth - 1];
    if (lexed.depth === 0) {
      roots.push(line);
    } else if (parent === undefined) {
      throw parseError('block without a header line', lexed.pos);
    } else {
      parent.children.push(line);
    }
    stack.push(line);
  }
  return roots;
}
