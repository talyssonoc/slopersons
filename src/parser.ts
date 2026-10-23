import type {
  BinaryOp,
  CallStep,
  Conditional,
  Expr,
  Flow,
  Lambda,
  Name,
  ProcDef,
  Statement,
  Step,
  WhileStmt,
} from './ast.ts';
import { parseError, type Pos } from './errors.ts';
import { lex, type OpToken, type StringPart, type Token } from './lexer.ts';
import { buildLineTree, type Line } from './line-tree.ts';

class Cursor {
  readonly tokens: Token[];
  i: number;
  readonly endPos: Pos;

  constructor(tokens: Token[], endPos: Pos) {
    this.tokens = tokens;
    this.i = 0;
    this.endPos = endPos;
  }

  peek(offset = 0): Token | undefined {
    return this.tokens[this.i + offset];
  }

  next(): Token {
    const token = this.tokens[this.i];
    if (token === undefined) throw parseError('unexpected end of line', this.endPos);
    this.i++;
    return token;
  }

  atEnd(): boolean {
    return this.i >= this.tokens.length;
  }

  pos(): Pos {
    return this.peek()?.pos ?? this.endPos;
  }

  isOp(op: string, offset = 0): boolean {
    const token = this.peek(offset);
    return token !== undefined && token.kind === 'op' && token.op === op;
  }

  isKeyword(word: string, offset = 0): boolean {
    const token = this.peek(offset);
    return token !== undefined && token.kind === 'keyword' && token.word === word;
  }

  isName(offset = 0): boolean {
    return this.peek(offset)?.kind === 'name';
  }

  expectOp(op: string, what: string): OpToken {
    const token = this.peek();
    if (token === undefined || token.kind !== 'op' || token.op !== op) {
      throw parseError(`expected ${what}`, this.pos());
    }
    this.i++;
    return token;
  }

  expectName(what: string): Name {
    const token = this.peek();
    if (token === undefined || token.kind !== 'name') throw parseError(`expected ${what}`, this.pos());
    this.i++;
    return { kind: 'name', name: token.name, pos: token.pos };
  }
}

const CMP_OPS: ReadonlySet<string> = new Set(['=', '/=', '<', '>', '<=', '>=']);
const NO_CHILDREN: Line[] = [];

function describe(token: Token | undefined): string {
  if (token === undefined) return 'end of line';
  switch (token.kind) {
    case 'op':
      return `\`${token.op}\``;
    case 'keyword':
      return `\`${token.word}\``;
    case 'name':
      return `\`${token.name}\``;
    case 'int':
      return `\`${token.value}\``;
    case 'float':
      return `\`${token.value}\``;
    case 'string':
      return 'a string';
    case 'char':
      return 'a char';
  }
}

function canStartExpr(token: Token | undefined): boolean {
  if (token === undefined) return false;
  switch (token.kind) {
    case 'int':
    case 'float':
    case 'string':
    case 'char':
    case 'name':
      return true;
    case 'keyword':
      return token.word === 'yes' || token.word === 'no' || token.word === 'nothing' || token.word === 'not';
    case 'op':
      return token.op === '(' || token.op === '[' || token.op === '{' || (token.op === '-' && token.unary);
  }
}

function isStop(c: Cursor, stopAt: ReadonlySet<string>): boolean {
  if (c.atEnd() || c.isOp(')')) return true;
  const token = c.peek();
  return token !== undefined && token.kind === 'op' && stopAt.has(token.op);
}

function asFlow(expr: Expr): Flow {
  return expr.kind === 'flow' ? expr : { kind: 'flow', head: expr, steps: [], pos: expr.pos };
}

function simplify(flow: Flow): Expr {
  return flow.steps.length === 0 ? flow.head : flow;
}

function popTrailingNames(args: Expr[]): string[] {
  const params: string[] = [];
  while (args.length > 0) {
    const last = args[args.length - 1];
    if (last === undefined || last.kind !== 'name') break;
    params.unshift(last.name);
    args.pop();
  }
  return params;
}

const EMPTY: ReadonlySet<string> = new Set();
const COLON: ReadonlySet<string> = new Set([':']);

class Parser {
  parseBlock(lines: Line[]): Statement[] {
    const statements: Statement[] = [];
    for (const line of lines) {
      const c = new Cursor(line.tokens, line.endPos);
      if (c.isOp(':')) {
        this.mergeElse(c, line, statements);
      } else if (c.isOp('->') || c.isOp('=>') || c.isOp('=>>')) {
        this.mergeContinuation(c, line, statements);
      } else {
        statements.push(this.parseStatement(c, line.children, EMPTY));
      }
    }
    return statements;
  }

  private parseStatement(c: Cursor, children: Line[], stopAt: ReadonlySet<string>): Statement {
    if (c.isKeyword('proc')) return this.parseProc(c, children);
    if (c.isKeyword('while')) return this.parseWhile(c, children);
    if (c.isKeyword('stop')) {
      const pos = c.next().pos;
      this.requireStop(c, stopAt);
      if (children.length > 0) throw parseError('`stop` cannot take a block', pos);
      return { kind: 'stop', pos };
    }
    const start = this.parseFlowStart(c, children);
    if (start.consumedChildren) {
      this.requireStop(c, stopAt);
      return { kind: 'flowstmt', expr: simplify(start.flow) };
    }
    return this.finishFlowStatement(start.flow, c, children, stopAt);
  }

  private finishFlowStatement(flow: Flow, c: Cursor, children: Line[], stopAt: ReadonlySet<string>): Statement {
    if (c.isOp('?')) {
      const conditional = this.parseConditional(flow, c, children);
      this.requireStop(c, stopAt);
      return conditional;
    }
    this.requireStop(c, stopAt);
    if (children.length > 0) this.attachBlock(flow, children);
    return { kind: 'flowstmt', expr: flow.steps.length === 0 ? flow.head : flow };
  }

  private requireStop(c: Cursor, stopAt: ReadonlySet<string>): void {
    if (isStop(c, stopAt)) return;
    const token = c.peek();
    if (token !== undefined && token.kind === 'op' && token.op === ':') {
      throw parseError('unexpected `:`; if an inline lambda comes before it, wrap the lambda in parentheses or use margin lines, since an inline lambda body runs to the end of the line', token.pos);
    }
    if (token !== undefined && token.kind === 'op' && token.op === '|') {
      throw parseError('unexpected `|`; a lambda needs parameters before the bar or must follow a procedure call', token.pos);
    }
    if (token !== undefined && token.kind === 'op' && token.op === '-' && token.unary) {
      throw parseError('unexpected `-`; binary operators need spaces on both sides', token.pos);
    }
    throw parseError(`unexpected ${describe(token)}`, c.pos());
  }

  private attachBlock(flow: Flow, children: Line[]): void {
    const last = flow.steps[flow.steps.length - 1];
    if (last === undefined) {
      throw parseError('this line cannot take a block; only procedure calls, conditionals, loops and lambdas can', flow.pos);
    }
    if (last.kind !== 'call') throw parseError('a binding cannot take a block', last.pos);
    if (last.body !== null) throw parseError('this call already has an inline lambda, so it cannot take a block', last.pos);
    const params = popTrailingNames(last.args);
    last.body = { kind: 'lambda', params, body: this.parseBlock(children), pos: last.pos };
  }

  private parseProc(c: Cursor, children: Line[]): ProcDef {
    const pos = c.next().pos;
    const name = c.expectName('a procedure name after `proc`');
    const params: string[] = [];
    while (c.isName()) params.push(c.expectName('parameter').name);
    const body = this.parseBody(c, children, 'procedure');
    return { kind: 'proc', name: name.name, params, body, pos };
  }

  private parseWhile(c: Cursor, children: Line[]): WhileStmt {
    const pos = c.next().pos;
    const cond = simplify(this.parseFlow(c));
    const body = this.parseBody(c, children, '`while`');
    return { kind: 'while', cond, body, pos };
  }

  private parseBody(c: Cursor, children: Line[], what: string): Statement[] {
    if (c.isOp('|')) {
      c.next();
      if (children.length > 0) throw parseError(`${what} has an inline body, so it cannot also take a block`, c.pos());
      return [this.parseStatement(c, NO_CHILDREN, EMPTY)];
    }
    if (!isStop(c, EMPTY)) throw parseError(`unexpected ${describe(c.peek())} in ${what} header`, c.pos());
    if (children.length === 0) throw parseError(`${what} needs a body`, c.pos());
    return this.parseBlock(children);
  }

  private parseConditional(cond: Flow, c: Cursor, children: Line[]): Conditional {
    const pos = c.expectOp('?', '`?`').pos;
    const conditional: Conditional = { kind: 'cond', branches: [], otherwise: null, pos };
    this.parseBranchBody(conditional, simplify(cond), c, children);
    return conditional;
  }

  private parseBranchBody(conditional: Conditional, cond: Expr, c: Cursor, children: Line[]): void {
    if (isStop(c, EMPTY)) {
      if (children.length === 0) throw parseError('`?` needs a body', c.pos());
      conditional.branches.push({ cond, body: this.parseBlock(children) });
      return;
    }
    if (children.length > 0) throw parseError('a conditional with an inline body cannot also take a block', c.pos());
    conditional.branches.push({ cond, body: [this.parseStatement(c, NO_CHILDREN, COLON)] });
    this.parseInlineElseChain(conditional, c);
  }

  private parseInlineElseChain(conditional: Conditional, c: Cursor): void {
    while (c.isOp(':')) {
      c.next();
      if (isStop(c, EMPTY)) throw parseError('`:` needs a body', c.pos());
      const save = c.i;
      const cond = simplify(this.parseFlow(c));
      if (c.isOp('?')) {
        c.next();
        if (isStop(c, EMPTY)) throw parseError('`?` needs a body', c.pos());
        conditional.branches.push({ cond, body: [this.parseStatement(c, NO_CHILDREN, COLON)] });
        continue;
      }
      c.i = save;
      conditional.otherwise = [this.parseStatement(c, NO_CHILDREN, COLON)];
      return;
    }
  }

  private mergeElse(c: Cursor, line: Line, statements: Statement[]): void {
    const colon = c.next();
    const prev = statements[statements.length - 1];
    if (prev === undefined || prev.kind !== 'cond') throw parseError('`:` without a preceding `?` at the same depth', colon.pos);
    if (prev.otherwise !== null) throw parseError('this conditional already has a final `:` branch', colon.pos);
    if (isStop(c, EMPTY)) {
      if (line.children.length === 0) throw parseError('`:` needs a body', c.pos());
      prev.otherwise = this.parseBlock(line.children);
      return;
    }
    const save = c.i;
    const cond = simplify(this.parseFlow(c));
    if (c.isOp('?')) {
      c.next();
      this.parseBranchBody(prev, cond, c, line.children);
      return;
    }
    c.i = save;
    if (line.children.length > 0) throw parseError('an inline `:` body cannot also take a block', c.pos());
    prev.otherwise = [this.parseStatement(c, NO_CHILDREN, EMPTY)];
  }

  private mergeContinuation(c: Cursor, line: Line, statements: Statement[]): void {
    const prev = statements[statements.length - 1];
    if (prev === undefined || prev.kind !== 'flowstmt') {
      throw parseError('a line starting with `->` continues the flow above it, but there is none at this depth', c.pos());
    }
    const flow = asFlow(prev.expr);
    this.parseSteps(c, flow);
    statements[statements.length - 1] = this.finishFlowStatement(flow, c, line.children, EMPTY);
  }

  private parseFlowStart(c: Cursor, children: Line[]): { flow: Flow; consumedChildren: boolean } {
    let names = 0;
    while (c.isName(names)) names++;
    if (names > 0 && c.isOp('|', names)) {
      const pos = c.pos();
      const params: string[] = [];
      for (let n = 0; n < names; n++) params.push(c.expectName('parameter').name);
      c.next();
      const body = [this.parseStatement(c, NO_CHILDREN, EMPTY)];
      const lambda: Lambda = { kind: 'lambda', params, body, pos };
      return { flow: asFlow(lambda), consumedChildren: false };
    }
    if (names > 0 && c.peek(names) === undefined && children.length > 0) {
      const pos = c.pos();
      const params: string[] = [];
      for (let n = 0; n < names; n++) params.push(c.expectName('parameter').name);
      const lambda: Lambda = { kind: 'lambda', params, body: this.parseBlock(children), pos };
      return { flow: asFlow(lambda), consumedChildren: true };
    }
    return { flow: this.parseFlow(c), consumedChildren: false };
  }

  private parseFlow(c: Cursor): Flow {
    const head = this.parseExpr(c);
    const flow: Flow = { kind: 'flow', head, steps: [], pos: head.pos };
    this.parseSteps(c, flow);
    return flow;
  }

  private parseSteps(c: Cursor, flow: Flow): void {
    while (true) {
      if (c.isOp('->')) {
        flow.steps.push(this.parseCallStep(c));
      } else if (c.isOp('=>') || c.isOp('=>>')) {
        const arrow = c.next() as OpToken;
        const name = c.expectName(`a name after \`${arrow.op}\``);
        flow.steps.push({ kind: 'bind', name: name.name, outer: arrow.op === '=>>', pos: arrow.pos });
      } else {
        return;
      }
    }
  }

  private parseCallStep(c: Cursor): Step {
    const pos = c.expectOp('->', '`->`').pos;
    let callee: Expr;
    if (c.isName()) {
      callee = c.expectName('procedure');
    } else if (c.isOp('(')) {
      callee = this.parseParen(c);
    } else {
      throw parseError(`expected a procedure name after \`->\`, found ${describe(c.peek())}`, c.pos());
    }
    const args: Expr[] = [];
    while (canStartExpr(c.peek())) args.push(this.parseExpr(c));
    const step: CallStep = { kind: 'call', callee, args, body: null, pos };
    if (c.isOp('|')) {
      const barPos = c.next().pos;
      const params = popTrailingNames(args);
      const body = [this.parseStatement(c, NO_CHILDREN, EMPTY)];
      step.body = { kind: 'lambda', params, body, pos: barPos };
    }
    return step;
  }

  private parseExpr(c: Cursor): Expr {
    return this.parseOr(c);
  }

  private parseOr(c: Cursor): Expr {
    let left = this.parseAnd(c);
    while (c.isKeyword('or')) {
      const pos = c.next().pos;
      left = { kind: 'binary', op: 'or', left, right: this.parseAnd(c), pos };
    }
    return left;
  }

  private parseAnd(c: Cursor): Expr {
    let left = this.parseNot(c);
    while (c.isKeyword('and')) {
      const pos = c.next().pos;
      left = { kind: 'binary', op: 'and', left, right: this.parseNot(c), pos };
    }
    return left;
  }

  private parseNot(c: Cursor): Expr {
    if (c.isKeyword('not')) {
      const pos = c.next().pos;
      return { kind: 'unary', op: 'not', operand: this.parseNot(c), pos };
    }
    return this.parseComparison(c);
  }

  private parseComparison(c: Cursor): Expr {
    const left = this.parseAdditive(c);
    const token = c.peek();
    if (token === undefined || token.kind !== 'op' || !CMP_OPS.has(token.op)) return left;
    c.next();
    const right = this.parseAdditive(c);
    const again = c.peek();
    if (again !== undefined && again.kind === 'op' && CMP_OPS.has(again.op)) {
      throw parseError('comparisons cannot be chained; combine them with `and`', again.pos);
    }
    return { kind: 'binary', op: token.op as BinaryOp, left, right, pos: token.pos };
  }

  private parseAdditive(c: Cursor): Expr {
    let left = this.parseMultiplicative(c);
    while (true) {
      const token = c.peek();
      if (token === undefined || token.kind !== 'op') return left;
      if (token.op !== '+' && !(token.op === '-' && !token.unary)) return left;
      c.next();
      left = { kind: 'binary', op: token.op as BinaryOp, left, right: this.parseMultiplicative(c), pos: token.pos };
    }
  }

  private parseMultiplicative(c: Cursor): Expr {
    let left = this.parseUnary(c);
    while (true) {
      const token = c.peek();
      if (token === undefined) return left;
      let op: BinaryOp;
      if (token.kind === 'op' && (token.op === '*' || token.op === '/')) {
        op = token.op;
      } else if (token.kind === 'keyword' && token.word === 'mod') {
        op = 'mod';
      } else {
        return left;
      }
      c.next();
      left = { kind: 'binary', op, left, right: this.parseUnary(c), pos: token.pos };
    }
  }

  private parseUnary(c: Cursor): Expr {
    if (c.isOp('-')) {
      const pos = c.next().pos;
      return { kind: 'unary', op: '-', operand: this.parseUnary(c), pos };
    }
    return this.parsePrimary(c);
  }

  private parsePrimary(c: Cursor): Expr {
    const token = c.peek();
    if (token === undefined) throw parseError('expected a value, found end of line', c.pos());
    switch (token.kind) {
      case 'int':
        c.next();
        return { kind: 'int', value: token.value, pos: token.pos };
      case 'float':
        c.next();
        return { kind: 'float', value: token.value, pos: token.pos };
      case 'char':
        c.next();
        return { kind: 'char', value: token.value, pos: token.pos };
      case 'string':
        c.next();
        return this.buildString(token.parts, token.pos);
      case 'name':
        c.next();
        return { kind: 'name', name: token.name, pos: token.pos };
      case 'keyword':
        c.next();
        if (token.word === 'yes') return { kind: 'bool', value: true, pos: token.pos };
        if (token.word === 'no') return { kind: 'bool', value: false, pos: token.pos };
        if (token.word === 'nothing') return { kind: 'nothing', pos: token.pos };
        throw parseError(`unexpected keyword \`${token.word}\``, token.pos);
      case 'op':
        if (token.op === '(') return this.parseParen(c);
        if (token.op === '[') return this.parseArray(c);
        if (token.op === '{') return this.parseMap(c);
        if (token.op === '|') throw parseError('unexpected `|`; a lambda used as a value must be wrapped in parentheses', token.pos);
        throw parseError(`expected a value, found ${describe(token)}`, token.pos);
    }
  }

  private buildString(parts: StringPart[], pos: Pos): Expr {
    if (parts.length === 0) return { kind: 'string', value: '', pos };
    const only = parts[0];
    if (parts.length === 1 && only !== undefined && only.kind === 'text') return { kind: 'string', value: only.text, pos };
    const built: Array<string | Expr> = [];
    for (const part of parts) {
      if (part.kind === 'text') {
        built.push(part.text);
      } else {
        const c = new Cursor(part.tokens, part.pos);
        built.push(this.parseEnclosed(c, 'interpolation', false));
        if (!c.atEnd()) throw parseError(`unexpected ${describe(c.peek())} in interpolation`, c.pos());
      }
    }
    return { kind: 'interp', parts: built, pos };
  }

  private parseParen(c: Cursor): Expr {
    c.expectOp('(', '`(`');
    const expr = this.parseEnclosed(c, 'parentheses', true);
    c.expectOp(')', '`)`');
    return expr;
  }

  private parseEnclosed(c: Cursor, what: string, wrapNames: boolean): Expr {
    const pos = c.pos();
    if (c.isOp('|')) {
      c.next();
      const body = [this.parseStatement(c, NO_CHILDREN, EMPTY)];
      return { kind: 'lambda', params: [], body, pos };
    }
    const statement = this.parseStatement(c, NO_CHILDREN, EMPTY);
    switch (statement.kind) {
      case 'flowstmt':
        return wrapNames && statement.expr.kind === 'name' ? asFlow(statement.expr) : statement.expr;
      case 'cond':
        return statement;
      default:
        throw parseError(`\`${statement.kind}\` is not a value and cannot appear in ${what}`, pos);
    }
  }

  private parseArray(c: Cursor): Expr {
    const pos = c.expectOp('[', '`[`').pos;
    const items: Expr[] = [];
    while (!c.isOp(']')) {
      if (c.atEnd()) throw parseError('unclosed `[`', pos);
      items.push(this.parseExpr(c));
    }
    c.next();
    return { kind: 'array', items, pos };
  }

  private parseMap(c: Cursor): Expr {
    const pos = c.expectOp('{', '`{`').pos;
    const entries = [];
    while (!c.isOp('}')) {
      if (c.atEnd()) throw parseError('unclosed `{`', pos);
      const key = this.parseExpr(c);
      c.expectOp(':', '`:` between a key and its value');
      const value = this.parseExpr(c);
      entries.push({ key, value });
    }
    c.next();
    return { kind: 'map', entries, pos };
  }
}

export function parse(source: string): Statement[] {
  const tree = buildLineTree(lex(source));
  return new Parser().parseBlock(tree);
}
