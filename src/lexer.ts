import { parseError, type Pos } from './errors.ts';

export type Keyword = 'proc' | 'while' | 'stop' | 'yes' | 'no' | 'nothing' | 'and' | 'or' | 'not' | 'mod';

const KEYWORDS: ReadonlySet<string> = new Set(['proc', 'while', 'stop', 'yes', 'no', 'nothing', 'and', 'or', 'not', 'mod']);

export interface IntToken {
  kind: 'int';
  value: bigint;
  pos: Pos;
}

export interface FloatToken {
  kind: 'float';
  value: number;
  pos: Pos;
}

export type StringPart = { kind: 'text'; text: string } | { kind: 'expr'; tokens: Token[]; pos: Pos };

export interface StringToken {
  kind: 'string';
  parts: StringPart[];
  pos: Pos;
}

export interface CharToken {
  kind: 'char';
  value: string;
  pos: Pos;
}

export interface NameToken {
  kind: 'name';
  name: string;
  pos: Pos;
}

export interface KeywordToken {
  kind: 'keyword';
  word: Keyword;
  pos: Pos;
}

export interface OpToken {
  kind: 'op';
  op: string;
  unary: boolean;
  pos: Pos;
}

export type Token = IntToken | FloatToken | StringToken | CharToken | NameToken | KeywordToken | OpToken;

export interface LexedLine {
  depth: number;
  tokens: Token[];
  pos: Pos;
  endPos: Pos;
}

const MULTI_CHAR_OPS = ['=>>', '->', '=>', '/=', '<=', '>='];
const SINGLE_CHAR_OPS = new Set(['=', '<', '>', '+', '*', '/', '?', ':', '|', '(', ')', '[', ']', '{', '}']);
const OPENERS = new Set(['(', '[', '{']);
const CLOSERS: Record<string, string> = { ')': '(', ']': '[', '}': '{' };

function isDigit(ch: string): boolean {
  return ch >= '0' && ch <= '9';
}

function isLetter(ch: string): boolean {
  return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z');
}

function isNameChar(ch: string): boolean {
  return isLetter(ch) || isDigit(ch);
}

function isBlank(ch: string): boolean {
  return ch === ' ' || ch === '\t' || ch === '\r';
}

class Lexer {
  private readonly src: string;
  private i: number;
  private line: number;
  private col: number;
  private readonly openBrackets: Array<{ ch: string; pos: Pos }>;

  constructor(src: string, start: Pos) {
    this.src = src;
    this.i = 0;
    this.line = start.line;
    this.col = start.col;
    this.openBrackets = [];
  }

  private pos(): Pos {
    return { line: this.line, col: this.col };
  }

  private peek(offset = 0): string {
    return this.src[this.i + offset] ?? '';
  }

  private advance(count = 1): void {
    for (let n = 0; n < count; n++) {
      if (this.src[this.i] === '\n') {
        this.line++;
        this.col = 1;
      } else {
        this.col++;
      }
      this.i++;
    }
  }

  private atEnd(): boolean {
    return this.i >= this.src.length;
  }

  lexLines(): LexedLine[] {
    const lines: LexedLine[] = [];
    let current: LexedLine | null = null;
    let atLineStart = true;
    while (!this.atEnd()) {
      if (atLineStart) {
        current = this.startLine();
        atLineStart = false;
      }
      const ch = this.peek();
      if (ch === '\n') {
        if (this.openBrackets.length === 0) {
          if (current !== null && current.tokens.length > 0) lines.push(current);
          current = null;
          atLineStart = true;
        }
        this.advance();
        continue;
      }
      if (isBlank(ch)) {
        this.advance();
        continue;
      }
      if (ch === '~') {
        this.skipComment();
        continue;
      }
      const token = this.lexToken();
      if (current === null) throw parseError('internal: token outside of a line', token.pos);
      current.tokens.push(token);
      current.endPos = this.pos();
    }
    const unclosed = this.openBrackets[this.openBrackets.length - 1];
    if (unclosed !== undefined) throw parseError(`unclosed \`${unclosed.ch}\``, unclosed.pos);
    if (current !== null && current.tokens.length > 0) lines.push(current);
    return lines;
  }

  lexFragment(): Token[] {
    const tokens: Token[] = [];
    while (!this.atEnd()) {
      const ch = this.peek();
      if (ch === '\n') throw parseError('line break inside string interpolation', this.pos());
      if (isBlank(ch)) {
        this.advance();
        continue;
      }
      if (ch === '~') throw parseError('comment inside string interpolation', this.pos());
      tokens.push(this.lexToken());
    }
    const unclosed = this.openBrackets[this.openBrackets.length - 1];
    if (unclosed !== undefined) throw parseError(`unclosed \`${unclosed.ch}\``, unclosed.pos);
    return tokens;
  }

  private startLine(): LexedLine {
    let depth = 0;
    while (!this.atEnd()) {
      const ch = this.peek();
      if (isBlank(ch)) {
        this.advance();
      } else if (ch === '|') {
        depth++;
        this.advance();
      } else {
        break;
      }
    }
    const pos = this.pos();
    return { depth, tokens: [], pos, endPos: pos };
  }

  private skipComment(): void {
    while (!this.atEnd() && this.peek() !== '\n') this.advance();
  }

  private lexToken(): Token {
    const ch = this.peek();
    const pos = this.pos();
    if (ch === '"') return this.lexString();
    if (ch === '`') return this.lexChar();
    if (isDigit(ch)) return this.lexNumber();
    if (isLetter(ch)) return this.lexName();
    if (ch === '-') return this.lexMinus();
    for (const op of MULTI_CHAR_OPS) {
      if (this.src.startsWith(op, this.i)) {
        this.advance(op.length);
        return { kind: 'op', op, unary: false, pos };
      }
    }
    if (SINGLE_CHAR_OPS.has(ch)) {
      this.advance();
      this.trackBracket(ch, pos);
      return { kind: 'op', op: ch, unary: false, pos };
    }
    throw parseError(`unexpected character \`${ch}\``, pos);
  }

  private trackBracket(ch: string, pos: Pos): void {
    if (OPENERS.has(ch)) {
      this.openBrackets.push({ ch, pos });
      return;
    }
    const opener = CLOSERS[ch];
    if (opener === undefined) return;
    const top = this.openBrackets.pop();
    if (top === undefined) throw parseError(`unmatched \`${ch}\``, pos);
    if (top.ch !== opener) throw parseError(`\`${ch}\` does not match the open \`${top.ch}\``, pos);
  }

  private lexMinus(): OpToken {
    const pos = this.pos();
    if (this.peek(1) === '>') {
      this.advance(2);
      return { kind: 'op', op: '->', unary: false, pos };
    }
    const prev = this.i === 0 ? '' : (this.src[this.i - 1] ?? '');
    const next = this.peek(1);
    const prevAllowsUnary = prev === '' || prev === '\n' || isBlank(prev) || OPENERS.has(prev);
    const nextStartsOperand = isDigit(next) || isLetter(next) || next === '(';
    this.advance();
    return { kind: 'op', op: '-', unary: prevAllowsUnary && nextStartsOperand, pos };
  }

  private lexNumber(): IntToken | FloatToken {
    const pos = this.pos();
    const intText = this.readDigits();
    if (this.peek() === '.' && isDigit(this.peek(1))) {
      this.advance();
      const fracText = this.readDigits();
      this.rejectTrailingNameChar(pos);
      return { kind: 'float', value: Number(`${intText}.${fracText}`), pos };
    }
    this.rejectTrailingNameChar(pos);
    return { kind: 'int', value: BigInt(intText), pos };
  }

  private readDigits(): string {
    let text = '';
    while (!this.atEnd()) {
      const ch = this.peek();
      if (isDigit(ch)) {
        text += ch;
      } else if (ch !== '_') {
        break;
      }
      this.advance();
    }
    return text;
  }

  private rejectTrailingNameChar(pos: Pos): void {
    if (isLetter(this.peek()) || this.peek() === '.') {
      throw parseError('invalid number literal', pos);
    }
  }

  private lexName(): NameToken | KeywordToken {
    const pos = this.pos();
    let name = '';
    while (!this.atEnd()) {
      const ch = this.peek();
      if (isNameChar(ch)) {
        name += ch;
        this.advance();
      } else if (ch === '-' && isNameChar(this.peek(1))) {
        name += ch;
        this.advance();
      } else {
        break;
      }
    }
    if (KEYWORDS.has(name)) return { kind: 'keyword', word: name as Keyword, pos };
    return { kind: 'name', name, pos };
  }

  private lexChar(): CharToken {
    const pos = this.pos();
    this.advance();
    if (this.atEnd() || this.peek() === '\n' || this.peek() === '`') {
      throw parseError('char literal must contain exactly one character', pos);
    }
    const value = this.peek() === '\\' ? this.lexEscape(pos) : this.readCodePoint();
    if (this.peek() !== '`') throw parseError('char literal must contain exactly one character', pos);
    this.advance();
    return { kind: 'char', value, pos };
  }

  private readCodePoint(): string {
    const cp = this.src.codePointAt(this.i);
    if (cp === undefined) throw parseError('unexpected end of input', this.pos());
    const text = String.fromCodePoint(cp);
    this.advance(text.length);
    return text;
  }

  private lexEscape(literalPos: Pos): string {
    const escPos = this.pos();
    this.advance();
    const ch = this.peek();
    this.advance();
    switch (ch) {
      case 'n':
        return '\n';
      case 't':
        return '\t';
      case 'r':
        return '\r';
      case '\\':
        return '\\';
      case '"':
        return '"';
      case '`':
        return '`';
      case '{':
        return '{';
      case '}':
        return '}';
      default:
        throw parseError(`unknown escape \`\\${ch}\` in literal starting at ${literalPos.line}:${literalPos.col}`, escPos);
    }
  }

  private lexString(): StringToken {
    const pos = this.pos();
    this.advance();
    const parts: StringPart[] = [];
    let text = '';
    const flushText = (): void => {
      if (text.length > 0) parts.push({ kind: 'text', text });
      text = '';
    };
    while (true) {
      if (this.atEnd() || this.peek() === '\n') throw parseError('unterminated string', pos);
      const ch = this.peek();
      if (ch === '"') {
        this.advance();
        break;
      }
      if (ch === '\\') {
        text += this.lexEscape(pos);
        continue;
      }
      if (ch === '{') {
        flushText();
        parts.push(this.lexInterpolation());
        continue;
      }
      if (ch === '}') throw parseError('unmatched `}` in string; write `\\}` for a literal brace', this.pos());
      text += this.readCodePoint();
    }
    flushText();
    return { kind: 'string', parts, pos };
  }

  private lexInterpolation(): StringPart {
    const bracePos = this.pos();
    this.advance();
    const innerPos = this.pos();
    const start = this.i;
    let depth = 1;
    while (depth > 0) {
      if (this.atEnd() || this.peek() === '\n') throw parseError('unterminated interpolation', bracePos);
      const ch = this.peek();
      if (ch === '"') {
        this.skipNestedString(bracePos);
        continue;
      }
      if (ch === '{') depth++;
      if (ch === '}') depth--;
      if (depth > 0) this.advance();
    }
    const inner = this.src.slice(start, this.i);
    this.advance();
    if (inner.trim().length === 0) throw parseError('empty interpolation', bracePos);
    const tokens = new Lexer(inner, innerPos).lexFragment();
    return { kind: 'expr', tokens, pos: innerPos };
  }

  private skipNestedString(bracePos: Pos): void {
    this.advance();
    while (true) {
      if (this.atEnd() || this.peek() === '\n') {
        throw parseError('unterminated interpolation; a `"` inside `{}` starts a nested string', bracePos);
      }
      const ch = this.peek();
      this.advance();
      if (ch === '\\') {
        this.advance();
        continue;
      }
      if (ch === '"') return;
    }
  }
}

export function lex(source: string): LexedLine[] {
  return new Lexer(source, { line: 1, col: 1 }).lexLines();
}
