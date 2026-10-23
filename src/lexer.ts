import { incompleteError, parseError, type Position } from './errors.ts';

export type Keyword = 'proc' | 'while' | 'stop' | 'attempt' | 'recover' | 'export' | 'yes' | 'no' | 'nothing' | 'and' | 'or' | 'not' | 'mod';

const KEYWORDS: ReadonlySet<string> = new Set(['proc', 'while', 'stop', 'attempt', 'recover', 'export', 'yes', 'no', 'nothing', 'and', 'or', 'not', 'mod']);

export interface IntToken {
  kind: 'int';
  value: bigint;
  position: Position;
}

export interface FloatToken {
  kind: 'float';
  value: number;
  position: Position;
}

export type StringPart = { kind: 'text'; text: string } | { kind: 'expr'; tokens: Token[]; position: Position };

export interface StringToken {
  kind: 'string';
  parts: StringPart[];
  position: Position;
}

export interface CharToken {
  kind: 'char';
  value: string;
  position: Position;
}

export interface NameToken {
  kind: 'name';
  name: string;
  position: Position;
}

export interface QualifiedToken {
  kind: 'qualified';
  parts: string[];
  position: Position;
}

export interface KeywordToken {
  kind: 'keyword';
  word: Keyword;
  position: Position;
}

export interface OpToken {
  kind: 'op';
  operator: string;
  unary: boolean;
  position: Position;
}

export type Token = IntToken | FloatToken | StringToken | CharToken | NameToken | QualifiedToken | KeywordToken | OpToken;

export interface LexedLine {
  depth: number;
  tokens: Token[];
  position: Position;
  endPosition: Position;
}

const MULTI_CHAR_OPS = ['=>>', '->', '=>', '/=', '<=', '>='];
const SINGLE_CHAR_OPS = new Set(['=', '<', '>', '+', '*', '/', '?', ':', '|', '(', ')', '[', ']', '{', '}']);
const OPENERS = new Set(['(', '[', '{']);
const CLOSERS: Record<string, string> = { ')': '(', ']': '[', '}': '{' };

function isDigit(character: string): boolean {
  return character >= '0' && character <= '9';
}

function isLetter(character: string): boolean {
  return (character >= 'a' && character <= 'z') || (character >= 'A' && character <= 'Z');
}

function isNameChar(character: string): boolean {
  return isLetter(character) || isDigit(character);
}

function isBlank(character: string): boolean {
  return character === ' ' || character === '\t' || character === '\r';
}

class Lexer {
  private readonly source: string;
  private i: number;
  private line: number;
  private col: number;
  private readonly openBrackets: Array<{ character: string; position: Position }>;

  private readonly file: string | undefined;

  constructor(source: string, start: Position, file?: string) {
    this.file = file;
    this.source = source;
    this.i = 0;
    this.line = start.line;
    this.col = start.col;
    this.openBrackets = [];
  }

  private position(): Position {
    return this.file === undefined ? { line: this.line, col: this.col } : { line: this.line, col: this.col, file: this.file };
  }

  private peek(offset = 0): string {
    return this.source[this.i + offset] ?? '';
  }

  private advance(count = 1): void {
    for (let total = 0; total < count; total++) {
      if (this.source[this.i] === '\n') {
        this.line++;
        this.col = 1;
      } else {
        this.col++;
      }
      this.i++;
    }
  }

  private atEnd(): boolean {
    return this.i >= this.source.length;
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
      const symbol = this.peek();
      if (symbol === '\n') {
        if (this.openBrackets.length === 0) {
          if (current !== null && current.tokens.length > 0) lines.push(current);
          current = null;
          atLineStart = true;
        }
        this.advance();
        continue;
      }
      if (isBlank(symbol)) {
        this.advance();
        continue;
      }
      if (symbol === '~') {
        this.skipComment();
        continue;
      }
      const token = this.lexToken();
      if (current === null) throw parseError('internal: token outside of a line', token.position);
      current.tokens.push(token);
      current.endPosition = this.position();
    }
    const unclosed = this.openBrackets[this.openBrackets.length - 1];
    if (unclosed !== undefined) throw incompleteError(`unclosed \`${unclosed.character}\``, unclosed.position);
    if (current !== null && current.tokens.length > 0) lines.push(current);
    return lines;
  }

  lexFragment(): Token[] {
    const tokens: Token[] = [];
    while (!this.atEnd()) {
      const symbol = this.peek();
      if (symbol === '\n') throw parseError('line break inside string interpolation', this.position());
      if (isBlank(symbol)) {
        this.advance();
        continue;
      }
      if (symbol === '~') throw parseError('comment inside string interpolation', this.position());
      tokens.push(this.lexToken());
    }
    const unclosed = this.openBrackets[this.openBrackets.length - 1];
    if (unclosed !== undefined) throw incompleteError(`unclosed \`${unclosed.character}\``, unclosed.position);
    return tokens;
  }

  private startLine(): LexedLine {
    let depth = 0;
    while (!this.atEnd()) {
      const character = this.peek();
      if (isBlank(character)) {
        this.advance();
      } else if (character === '|') {
        depth++;
        this.advance();
      } else {
        break;
      }
    }
    const location = this.position();
    return { depth, tokens: [], position: location, endPosition: location };
  }

  private skipComment(): void {
    while (!this.atEnd() && this.peek() !== '\n') this.advance();
  }

  private lexToken(): Token {
    const character = this.peek();
    const location = this.position();
    if (character === '"') return this.lexString();
    if (character === '`') return this.lexChar();
    if (isDigit(character)) return this.lexNumber();
    if (isLetter(character)) return this.lexName();
    if (character === '-') return this.lexMinus();
    for (const operator of MULTI_CHAR_OPS) {
      if (this.source.startsWith(operator, this.i)) {
        this.advance(operator.length);
        return { kind: 'op', operator, unary: false, position: location };
      }
    }
    if (SINGLE_CHAR_OPS.has(character)) {
      this.advance();
      this.trackBracket(character, location);
      return { kind: 'op', operator: character, unary: false, position: location };
    }
    throw parseError(`unexpected character \`${character}\``, location);
  }

  private trackBracket(symbol: string, location: Position): void {
    if (OPENERS.has(symbol)) {
      this.openBrackets.push({ character: symbol, position: location });
      return;
    }
    const opener = CLOSERS[symbol];
    if (opener === undefined) return;
    const top = this.openBrackets.pop();
    if (top === undefined) throw parseError(`unmatched \`${symbol}\``, location);
    if (top.character !== opener) throw parseError(`\`${symbol}\` does not match the open \`${top.character}\``, location);
  }

  private lexMinus(): OpToken {
    const location = this.position();
    if (this.peek(1) === '>') {
      this.advance(2);
      return { kind: 'op', operator: '->', unary: false, position: location };
    }
    const previous = this.i === 0 ? '' : (this.source[this.i - 1] ?? '');
    const next = this.peek(1);
    const prevAllowsUnary = previous === '' || previous === '\n' || isBlank(previous) || OPENERS.has(previous);
    const nextStartsOperand = isDigit(next) || isLetter(next) || next === '(';
    this.advance();
    return { kind: 'op', operator: '-', unary: prevAllowsUnary && nextStartsOperand, position: location };
  }

  private lexNumber(): IntToken | FloatToken {
    const location = this.position();
    const intText = this.readDigits();
    if (this.peek() === '.' && isDigit(this.peek(1))) {
      this.advance();
      const fracText = this.readDigits();
      this.rejectTrailingNameChar(location);
      return { kind: 'float', value: Number(`${intText}.${fracText}`), position: location };
    }
    this.rejectTrailingNameChar(location);
    return { kind: 'int', value: BigInt(intText), position: location };
  }

  private readDigits(): string {
    let text = '';
    while (!this.atEnd()) {
      const character = this.peek();
      if (isDigit(character)) {
        text += character;
      } else if (character !== '_') {
        break;
      }
      this.advance();
    }
    return text;
  }

  private rejectTrailingNameChar(position: Position): void {
    if (isLetter(this.peek()) || this.peek() === '.') {
      throw parseError('invalid number literal', position);
    }
  }

  private lexName(): NameToken | QualifiedToken | KeywordToken {
    const location = this.position();
    const parts: string[] = [this.readNameSegment()];
    while (this.peek() === '/' && isLetter(this.peek(1))) {
      this.advance();
      parts.push(this.readNameSegment());
    }
    if (parts.length > 1) return { kind: 'qualified', parts, position: location };
    const name = parts[0] ?? '';
    if (KEYWORDS.has(name)) return { kind: 'keyword', word: name as Keyword, position: location };
    return { kind: 'name', name, position: location };
  }

  private readNameSegment(): string {
    let name = '';
    while (!this.atEnd()) {
      const character = this.peek();
      if (isNameChar(character)) {
        name += character;
        this.advance();
      } else if (character === '-' && isNameChar(this.peek(1))) {
        name += character;
        this.advance();
      } else {
        break;
      }
    }
    return name;
  }

  private lexChar(): CharToken {
    const location = this.position();
    this.advance();
    if (this.atEnd() || this.peek() === '\n' || this.peek() === '`') {
      throw parseError('char literal must contain exactly one character', location);
    }
    const value = this.peek() === '\\' ? this.lexEscape(location) : this.readCodePoint();
    if (this.peek() !== '`') throw parseError('char literal must contain exactly one character', location);
    this.advance();
    return { kind: 'char', value, position: location };
  }

  private readCodePoint(): string {
    const codePoint = this.source.codePointAt(this.i);
    if (codePoint === undefined) throw parseError('unexpected end of input', this.position());
    const text = String.fromCodePoint(codePoint);
    this.advance(text.length);
    return text;
  }

  private lexEscape(literalPosition: Position): string {
    const escapePosition = this.position();
    this.advance();
    const character = this.peek();
    this.advance();
    switch (character) {
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
        throw parseError(`unknown escape \`\\${character}\` in literal starting at ${literalPosition.line}:${literalPosition.col}`, escapePosition);
    }
  }

  private lexString(): StringToken {
    const location = this.position();
    this.advance();
    const parts: StringPart[] = [];
    let text = '';
    const flushText = (): void => {
      if (text.length > 0) parts.push({ kind: 'text', text });
      text = '';
    };
    while (true) {
      if (this.atEnd() || this.peek() === '\n') throw parseError('unterminated string', location);
      const character = this.peek();
      if (character === '"') {
        this.advance();
        break;
      }
      if (character === '\\') {
        text += this.lexEscape(location);
        continue;
      }
      if (character === '{') {
        flushText();
        parts.push(this.lexInterpolation());
        continue;
      }
      if (character === '}') throw parseError('unmatched `}` in string; write `\\}` for a literal brace', this.position());
      text += this.readCodePoint();
    }
    flushText();
    return { kind: 'string', parts, position: location };
  }

  private lexInterpolation(): StringPart {
    const bracePosition = this.position();
    this.advance();
    const innerPosition = this.position();
    const start = this.i;
    let depth = 1;
    while (depth > 0) {
      if (this.atEnd() || this.peek() === '\n') throw parseError('unterminated interpolation', bracePosition);
      const character = this.peek();
      if (character === '"') {
        this.skipNestedString(bracePosition);
        continue;
      }
      if (character === '{') depth++;
      if (character === '}') depth--;
      if (depth > 0) this.advance();
    }
    const inner = this.source.slice(start, this.i);
    this.advance();
    if (inner.trim().length === 0) throw parseError('empty interpolation', bracePosition);
    const tokens = new Lexer(inner, innerPosition, this.file).lexFragment();
    return { kind: 'expr', tokens, position: innerPosition };
  }

  private skipNestedString(bracePosition: Position): void {
    this.advance();
    while (true) {
      if (this.atEnd() || this.peek() === '\n') {
        throw parseError('unterminated interpolation; a `"` inside `{}` starts a nested string', bracePosition);
      }
      const character = this.peek();
      this.advance();
      if (character === '\\') {
        this.advance();
        continue;
      }
      if (character === '"') return;
    }
  }
}

export function lex(source: string, file?: string): LexedLine[] {
  return new Lexer(source, { line: 1, col: 1 }, file).lexLines();
}
