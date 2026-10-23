import type {
  AttemptStatement,
  BinaryOp,
  CallStep,
  Conditional,
  Expression,
  Flow,
  Lambda,
  Name,
  ProcedureDefinition,
  Statement,
  Step,
  WhileStatement,
} from './ast.ts';
import { incompleteError, parseError, type Position } from './errors.ts';
import { lex, type OpToken, type StringPart, type Token } from './lexer.ts';
import { buildLineTree, type Line } from './line-tree.ts';

class Cursor {
  readonly tokens: Token[];
  i: number;
  readonly endPosition: Position;

  constructor(tokens: Token[], endPosition: Position) {
    this.tokens = tokens;
    this.i = 0;
    this.endPosition = endPosition;
  }

  peek(offset = 0): Token | undefined {
    return this.tokens[this.i + offset];
  }

  next(): Token {
    const token = this.tokens[this.i];
    if (token === undefined) throw incompleteError('unexpected end of line', this.endPosition);
    this.i++;
    return token;
  }

  atEnd(): boolean {
    return this.i >= this.tokens.length;
  }

  position(): Position {
    return this.peek()?.position ?? this.endPosition;
  }

  isOp(operator: string, offset = 0): boolean {
    const token = this.peek(offset);
    return token !== undefined && token.kind === 'op' && token.operator === operator;
  }

  isKeyword(word: string, offset = 0): boolean {
    const token = this.peek(offset);
    return token !== undefined && token.kind === 'keyword' && token.word === word;
  }

  isName(offset = 0): boolean {
    return this.peek(offset)?.kind === 'name';
  }

  expectOp(operator: string, what: string): OpToken {
    const token = this.peek();
    if (token === undefined || token.kind !== 'op' || token.operator !== operator) {
      throw parseError(`expected ${what}`, this.position());
    }
    this.i++;
    return token;
  }

  expectName(what: string): Name {
    const token = this.peek();
    if (token === undefined) throw incompleteError(`expected ${what}`, this.position());
    if (token.kind !== 'name') throw parseError(`expected ${what}`, this.position());
    this.i++;
    return { kind: 'name', name: token.name, position: token.position };
  }
}

const CMP_OPS: ReadonlySet<string> = new Set(['=', '/=', '<', '>', '<=', '>=']);
const NO_CHILDREN: Line[] = [];

function describe(token: Token | undefined): string {
  if (token === undefined) return 'end of line';
  switch (token.kind) {
    case 'op':
      return `\`${token.operator}\``;
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

function canStartExpression(token: Token | undefined): boolean {
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
      return token.operator === '(' || token.operator === '[' || token.operator === '{' || (token.operator === '-' && token.unary);
  }
}

function isStop(cursor: Cursor, stopAt: ReadonlySet<string>): boolean {
  if (cursor.atEnd() || cursor.isOp(')') || cursor.isKeyword('recover')) return true;
  const token = cursor.peek();
  return token !== undefined && token.kind === 'op' && stopAt.has(token.operator);
}

function asFlow(expression: Expression): Flow {
  return expression.kind === 'flow' ? expression : { kind: 'flow', head: expression, steps: [], position: expression.position };
}

function simplify(flow: Flow): Expression {
  return flow.steps.length === 0 ? flow.head : flow;
}

function popTrailingNames(inputs: Expression[]): string[] {
  const parameters: string[] = [];
  while (inputs.length > 0) {
    const last = inputs[inputs.length - 1];
    if (last === undefined || last.kind !== 'name') break;
    parameters.unshift(last.name);
    inputs.pop();
  }
  return parameters;
}

const EMPTY: ReadonlySet<string> = new Set();
const COLON: ReadonlySet<string> = new Set([':']);

class Parser {
  parseBlock(lines: Line[]): Statement[] {
    const statements: Statement[] = [];
    for (const line of lines) {
      const cursor = new Cursor(line.tokens, line.endPosition);
      if (cursor.isOp(':')) {
        this.mergeElse(cursor, line, statements);
      } else if (cursor.isKeyword('recover')) {
        this.mergeRecover(cursor, line, statements);
      } else if (cursor.isOp('->') || cursor.isOp('=>') || cursor.isOp('=>>')) {
        this.mergeContinuation(cursor, line, statements);
      } else {
        statements.push(this.parseStatement(cursor, line.children, EMPTY));
      }
      if (!cursor.atEnd()) {
        if (cursor.isKeyword('recover')) throw parseError('`recover` must follow an `attempt` body on the same line or an `attempt` block', cursor.position());
        throw parseError(`unexpected ${describe(cursor.peek())}`, cursor.position());
      }
    }
    for (const statement of statements) {
      if (statement.kind === 'attempt' && statement.handler === null) throw incompleteError('`attempt` needs a `recover`', statement.position);
    }
    return statements;
  }

  private parseStatement(cursor: Cursor, children: Line[], stopAt: ReadonlySet<string>): Statement {
    if (cursor.isKeyword('proc')) return this.parseProc(cursor, children);
    if (cursor.isKeyword('while')) return this.parseWhile(cursor, children);
    if (cursor.isKeyword('attempt')) return this.parseAttempt(cursor, children);
    if (cursor.isKeyword('stop')) {
      const location = cursor.next().position;
      this.requireStop(cursor, stopAt);
      if (children.length > 0) throw parseError('`stop` cannot take a block', location);
      return { kind: 'stop', position: location };
    }
    const start = this.parseFlowStart(cursor, children);
    if (start.consumedChildren) {
      this.requireStop(cursor, stopAt);
      return { kind: 'flow-statement', expression: simplify(start.flow) };
    }
    return this.finishFlowStatement(start.flow, cursor, children, stopAt);
  }

  private finishFlowStatement(flow: Flow, cursor: Cursor, children: Line[], stopAt: ReadonlySet<string>): Statement {
    if (cursor.isOp('?')) {
      const conditional = this.parseConditional(flow, cursor, children);
      this.requireStop(cursor, stopAt);
      return conditional;
    }
    this.requireStop(cursor, stopAt);
    if (children.length > 0) this.attachBlock(flow, children);
    return { kind: 'flow-statement', expression: flow.steps.length === 0 ? flow.head : flow };
  }

  private requireStop(cursor: Cursor, stopAt: ReadonlySet<string>): void {
    if (isStop(cursor, stopAt)) return;
    const token = cursor.peek();
    if (token !== undefined && token.kind === 'op' && token.operator === ':') {
      throw parseError('unexpected `:`; if an inline lambda comes before it, wrap the lambda in parentheses or use margin lines, since an inline lambda body runs to the end of the line', token.position);
    }
    if (token !== undefined && token.kind === 'op' && token.operator === '|') {
      throw parseError('unexpected `|`; a lambda needs parameters before the bar or must follow a procedure call', token.position);
    }
    if (token !== undefined && token.kind === 'op' && token.operator === '-' && token.unary) {
      throw parseError('unexpected `-`; binary operators need spaces on both sides', token.position);
    }
    throw parseError(`unexpected ${describe(token)}`, cursor.position());
  }

  private attachBlock(flow: Flow, children: Line[]): void {
    const last = flow.steps[flow.steps.length - 1];
    if (last === undefined) {
      throw parseError('this line cannot take a block; only procedure calls, conditionals, loops and lambdas can', flow.position);
    }
    if (last.kind !== 'call') throw parseError('a binding cannot take a block', last.position);
    if (last.body !== null) throw parseError('this call already has an inline lambda, so it cannot take a block', last.position);
    const parameters = popTrailingNames(last.arguments);
    last.body = { kind: 'lambda', parameters, body: this.parseBlock(children), position: last.position };
  }

  private parseProc(cursor: Cursor, children: Line[]): ProcedureDefinition {
    const location = cursor.next().position;
    const name = cursor.expectName('a procedure name after `proc`');
    const parameters: string[] = [];
    while (cursor.isName()) parameters.push(cursor.expectName('parameter').name);
    const body = this.parseBody(cursor, children, 'procedure');
    return { kind: 'proc', name: name.name, parameters, body, position: location };
  }

  private parseWhile(cursor: Cursor, children: Line[]): WhileStatement {
    const location = cursor.next().position;
    const condition = simplify(this.parseFlow(cursor));
    const body = this.parseBody(cursor, children, '`while`');
    return { kind: 'while', condition, body, position: location };
  }

  private parseBody(cursor: Cursor, children: Line[], what: string): Statement[] {
    if (cursor.isOp('|')) {
      cursor.next();
      if (children.length > 0) throw parseError(`${what} has an inline body, so it cannot also take a block`, cursor.position());
      return [this.parseStatement(cursor, NO_CHILDREN, EMPTY)];
    }
    if (!isStop(cursor, EMPTY)) throw parseError(`unexpected ${describe(cursor.peek())} in ${what} header`, cursor.position());
    if (children.length === 0) throw incompleteError(`${what} needs a body`, cursor.position());
    return this.parseBlock(children);
  }

  private parseConditional(condition: Flow, cursor: Cursor, children: Line[]): Conditional {
    const location = cursor.expectOp('?', '`?`').position;
    const conditional: Conditional = { kind: 'conditional', branches: [], otherwise: null, position: location };
    this.parseBranchBody(conditional, simplify(condition), cursor, children);
    return conditional;
  }

  private parseBranchBody(conditional: Conditional, condition: Expression, cursor: Cursor, children: Line[]): void {
    if (isStop(cursor, EMPTY)) {
      if (children.length === 0) throw incompleteError('`?` needs a body', cursor.position());
      conditional.branches.push({ condition, body: this.parseBlock(children) });
      return;
    }
    if (children.length > 0) throw parseError('a conditional with an inline body cannot also take a block', cursor.position());
    conditional.branches.push({ condition, body: [this.parseStatement(cursor, NO_CHILDREN, COLON)] });
    this.parseInlineElseChain(conditional, cursor);
  }

  private parseInlineElseChain(conditional: Conditional, cursor: Cursor): void {
    while (cursor.isOp(':')) {
      cursor.next();
      if (isStop(cursor, EMPTY)) throw incompleteError('`:` needs a body', cursor.position());
      const save = cursor.i;
      const condition = simplify(this.parseFlow(cursor));
      if (cursor.isOp('?')) {
        cursor.next();
        if (isStop(cursor, EMPTY)) throw incompleteError('`?` needs a body', cursor.position());
        conditional.branches.push({ condition, body: [this.parseStatement(cursor, NO_CHILDREN, COLON)] });
        continue;
      }
      cursor.i = save;
      conditional.otherwise = [this.parseStatement(cursor, NO_CHILDREN, COLON)];
      return;
    }
  }

  private parseAttempt(cursor: Cursor, children: Line[]): AttemptStatement {
    const location = cursor.next().position;
    const attempt: AttemptStatement = { kind: 'attempt', body: [], errorName: null, handler: null, position: location };
    if (cursor.isOp('|')) {
      cursor.next();
      attempt.body = [this.parseStatement(cursor, NO_CHILDREN, EMPTY)];
      if (cursor.isKeyword('recover')) {
        this.parseRecover(cursor, attempt, children);
      } else if (children.length > 0) {
        throw parseError('an inline `attempt` body cannot take a block; put `recover` on the same line or use a block body', cursor.position());
      }
      return attempt;
    }
    if (!isStop(cursor, EMPTY)) throw parseError(`unexpected ${describe(cursor.peek())} after \`attempt\``, cursor.position());
    if (children.length === 0) throw incompleteError('`attempt` needs a body', cursor.position());
    attempt.body = this.parseBlock(children);
    return attempt;
  }

  private parseRecover(cursor: Cursor, attempt: AttemptStatement, children: Line[]): void {
    const location = cursor.next().position;
    if (attempt.handler !== null) throw parseError('this `attempt` already has a `recover`', location);
    if (cursor.isName()) attempt.errorName = cursor.expectName('error name').name;
    attempt.handler = this.parseBody(cursor, children, '`recover`');
  }

  private mergeRecover(cursor: Cursor, line: Line, statements: Statement[]): void {
    const previous = statements[statements.length - 1];
    if (previous === undefined || previous.kind !== 'attempt') {
      throw parseError('`recover` without a preceding `attempt` at the same depth', cursor.position());
    }
    this.parseRecover(cursor, previous, line.children);
  }

  private mergeElse(cursor: Cursor, line: Line, statements: Statement[]): void {
    const colon = cursor.next();
    const previous = statements[statements.length - 1];
    if (previous === undefined || previous.kind !== 'conditional') throw parseError('`:` without a preceding `?` at the same depth', colon.position);
    if (previous.otherwise !== null) throw parseError('this conditional already has a final `:` branch', colon.position);
    if (isStop(cursor, EMPTY)) {
      if (line.children.length === 0) throw incompleteError('`:` needs a body', cursor.position());
      previous.otherwise = this.parseBlock(line.children);
      return;
    }
    const save = cursor.i;
    const condition = simplify(this.parseFlow(cursor));
    if (cursor.isOp('?')) {
      cursor.next();
      this.parseBranchBody(previous, condition, cursor, line.children);
      return;
    }
    cursor.i = save;
    if (line.children.length > 0) throw parseError('an inline `:` body cannot also take a block', cursor.position());
    previous.otherwise = [this.parseStatement(cursor, NO_CHILDREN, EMPTY)];
  }

  private mergeContinuation(cursor: Cursor, line: Line, statements: Statement[]): void {
    const previous = statements[statements.length - 1];
    if (previous === undefined || previous.kind !== 'flow-statement') {
      throw parseError('a line starting with `->` continues the flow above it, but there is none at this depth', cursor.position());
    }
    const flow = asFlow(previous.expression);
    this.parseSteps(cursor, flow);
    statements[statements.length - 1] = this.finishFlowStatement(flow, cursor, line.children, EMPTY);
  }

  private parseFlowStart(cursor: Cursor, children: Line[]): { flow: Flow; consumedChildren: boolean } {
    let names = 0;
    while (cursor.isName(names)) names++;
    if (names > 0 && cursor.isOp('|', names)) {
      const location = cursor.position();
      const parameters: string[] = [];
      for (let index = 0; index < names; index++) parameters.push(cursor.expectName('parameter').name);
      cursor.next();
      const body = [this.parseStatement(cursor, NO_CHILDREN, EMPTY)];
      const lambda: Lambda = { kind: 'lambda', parameters, body, position: location };
      return { flow: asFlow(lambda), consumedChildren: false };
    }
    if (names > 0 && cursor.peek(names) === undefined && children.length > 0) {
      const position = cursor.position();
      const parameterNames: string[] = [];
      for (let offset = 0; offset < names; offset++) parameterNames.push(cursor.expectName('parameter').name);
      const lambda: Lambda = { kind: 'lambda', parameters: parameterNames, body: this.parseBlock(children), position };
      return { flow: asFlow(lambda), consumedChildren: true };
    }
    return { flow: this.parseFlow(cursor), consumedChildren: false };
  }

  private parseFlow(cursor: Cursor): Flow {
    const head = this.parseExpression(cursor);
    const flow: Flow = { kind: 'flow', head, steps: [], position: head.position };
    this.parseSteps(cursor, flow);
    return flow;
  }

  private parseSteps(cursor: Cursor, flow: Flow): void {
    while (true) {
      if (cursor.isOp('->')) {
        flow.steps.push(this.parseCallStep(cursor));
      } else if (cursor.isOp('=>') || cursor.isOp('=>>')) {
        const arrow = cursor.next() as OpToken;
        const name = cursor.expectName(`a name after \`${arrow.operator}\``);
        flow.steps.push({ kind: 'bind', name: name.name, outer: arrow.operator === '=>>', position: arrow.position });
      } else {
        return;
      }
    }
  }

  private parseCallStep(cursor: Cursor): Step {
    const location = cursor.expectOp('->', '`->`').position;
    let callee: Expression;
    if (cursor.isName()) {
      callee = cursor.expectName('procedure');
    } else if (cursor.isOp('(')) {
      callee = this.parseParen(cursor);
    } else {
      const problem = cursor.atEnd() ? incompleteError : parseError;
      throw problem(`expected a procedure name after \`->\`, found ${describe(cursor.peek())}`, cursor.position());
    }
    const inputs: Expression[] = [];
    while (canStartExpression(cursor.peek())) inputs.push(this.parseExpression(cursor));
    const step: CallStep = { kind: 'call', callee, arguments: inputs, body: null, position: location };
    if (cursor.isOp('|')) {
      const barPosition = cursor.next().position;
      const parameters = popTrailingNames(inputs);
      const body = [this.parseStatement(cursor, NO_CHILDREN, EMPTY)];
      step.body = { kind: 'lambda', parameters, body, position: barPosition };
    }
    return step;
  }

  private parseExpression(cursor: Cursor): Expression {
    return this.parseOr(cursor);
  }

  private parseOr(cursor: Cursor): Expression {
    let left = this.parseAnd(cursor);
    while (cursor.isKeyword('or')) {
      const location = cursor.next().position;
      left = { kind: 'binary', operator: 'or', left, right: this.parseAnd(cursor), position: location };
    }
    return left;
  }

  private parseAnd(cursor: Cursor): Expression {
    let left = this.parseNot(cursor);
    while (cursor.isKeyword('and')) {
      const location = cursor.next().position;
      left = { kind: 'binary', operator: 'and', left, right: this.parseNot(cursor), position: location };
    }
    return left;
  }

  private parseNot(cursor: Cursor): Expression {
    if (cursor.isKeyword('not')) {
      const location = cursor.next().position;
      return { kind: 'unary', operator: 'not', operand: this.parseNot(cursor), position: location };
    }
    return this.parseComparison(cursor);
  }

  private parseComparison(cursor: Cursor): Expression {
    const left = this.parseAdditive(cursor);
    const token = cursor.peek();
    if (token === undefined || token.kind !== 'op' || !CMP_OPS.has(token.operator)) return left;
    cursor.next();
    const right = this.parseAdditive(cursor);
    const again = cursor.peek();
    if (again !== undefined && again.kind === 'op' && CMP_OPS.has(again.operator)) {
      throw parseError('comparisons cannot be chained; combine them with `and`', again.position);
    }
    return { kind: 'binary', operator: token.operator as BinaryOp, left, right, position: token.position };
  }

  private parseAdditive(cursor: Cursor): Expression {
    let left = this.parseMultiplicative(cursor);
    while (true) {
      const token = cursor.peek();
      if (token === undefined || token.kind !== 'op') return left;
      if (token.operator !== '+' && !(token.operator === '-' && !token.unary)) return left;
      cursor.next();
      left = { kind: 'binary', operator: token.operator as BinaryOp, left, right: this.parseMultiplicative(cursor), position: token.position };
    }
  }

  private parseMultiplicative(cursor: Cursor): Expression {
    let left = this.parseUnary(cursor);
    while (true) {
      const token = cursor.peek();
      if (token === undefined) return left;
      let operator: BinaryOp;
      if (token.kind === 'op' && (token.operator === '*' || token.operator === '/')) {
        operator = token.operator;
      } else if (token.kind === 'keyword' && token.word === 'mod') {
        operator = 'mod';
      } else {
        return left;
      }
      cursor.next();
      left = { kind: 'binary', operator, left, right: this.parseUnary(cursor), position: token.position };
    }
  }

  private parseUnary(cursor: Cursor): Expression {
    if (cursor.isOp('-')) {
      const location = cursor.next().position;
      return { kind: 'unary', operator: '-', operand: this.parseUnary(cursor), position: location };
    }
    return this.parsePrimary(cursor);
  }

  private parsePrimary(cursor: Cursor): Expression {
    const token = cursor.peek();
    if (token === undefined) throw incompleteError('expected a value, found end of line', cursor.position());
    switch (token.kind) {
      case 'int':
        cursor.next();
        return { kind: 'int', value: token.value, position: token.position };
      case 'float':
        cursor.next();
        return { kind: 'float', value: token.value, position: token.position };
      case 'char':
        cursor.next();
        return { kind: 'char', value: token.value, position: token.position };
      case 'string':
        cursor.next();
        return this.buildString(token.parts, token.position);
      case 'name':
        cursor.next();
        return { kind: 'name', name: token.name, position: token.position };
      case 'keyword':
        cursor.next();
        if (token.word === 'yes') return { kind: 'boolean', value: true, position: token.position };
        if (token.word === 'no') return { kind: 'boolean', value: false, position: token.position };
        if (token.word === 'nothing') return { kind: 'nothing', position: token.position };
        throw parseError(`unexpected keyword \`${token.word}\``, token.position);
      case 'op':
        if (token.operator === '(') return this.parseParen(cursor);
        if (token.operator === '[') return this.parseArray(cursor);
        if (token.operator === '{') return this.parseMap(cursor);
        if (token.operator === '|') throw parseError('unexpected `|`; a lambda used as a value must be wrapped in parentheses', token.position);
        throw parseError(`expected a value, found ${describe(token)}`, token.position);
    }
  }

  private buildString(parts: StringPart[], location: Position): Expression {
    if (parts.length === 0) return { kind: 'string', value: '', position: location };
    const only = parts[0];
    if (parts.length === 1 && only !== undefined && only.kind === 'text') return { kind: 'string', value: only.text, position: location };
    const built: Array<string | Expression> = [];
    for (const part of parts) {
      if (part.kind === 'text') {
        built.push(part.text);
      } else {
        const cursor = new Cursor(part.tokens, part.position);
        built.push(this.parseEnclosed(cursor, 'interpolation', false));
        if (!cursor.atEnd()) throw parseError(`unexpected ${describe(cursor.peek())} in interpolation`, cursor.position());
      }
    }
    return { kind: 'interpolation', parts: built, position: location };
  }

  private parseParen(cursor: Cursor): Expression {
    cursor.expectOp('(', '`(`');
    const expression = this.parseEnclosed(cursor, 'parentheses', true);
    cursor.expectOp(')', '`)`');
    return expression;
  }

  private parseEnclosed(cursor: Cursor, what: string, wrapNames: boolean): Expression {
    const location = cursor.position();
    if (cursor.isOp('|')) {
      cursor.next();
      const body = [this.parseStatement(cursor, NO_CHILDREN, EMPTY)];
      return { kind: 'lambda', parameters: [], body, position: location };
    }
    const statement = this.parseStatement(cursor, NO_CHILDREN, EMPTY);
    switch (statement.kind) {
      case 'flow-statement':
        return wrapNames && statement.expression.kind === 'name' ? asFlow(statement.expression) : statement.expression;
      case 'conditional':
        return statement;
      case 'attempt':
        if (statement.handler === null) throw parseError('`attempt` needs a `recover` on the same line when used as a value', location);
        return statement;
      default:
        throw parseError(`\`${statement.kind}\` is not a value and cannot appear in ${what}`, location);
    }
  }

  private parseArray(cursor: Cursor): Expression {
    const location = cursor.expectOp('[', '`[`').position;
    const items: Expression[] = [];
    while (!cursor.isOp(']')) {
      if (cursor.atEnd()) throw parseError('unclosed `[`', location);
      items.push(this.parseExpression(cursor));
    }
    cursor.next();
    return { kind: 'array', items, position: location };
  }

  private parseMap(cursor: Cursor): Expression {
    const location = cursor.expectOp('{', '`{`').position;
    const entries = [];
    while (!cursor.isOp('}')) {
      if (cursor.atEnd()) throw parseError('unclosed `{`', location);
      const key = this.parseExpression(cursor);
      cursor.expectOp(':', '`:` between a key and its value');
      const value = this.parseExpression(cursor);
      entries.push({ key, value });
    }
    cursor.next();
    return { kind: 'map', entries, position: location };
  }
}

export function parse(source: string): Statement[] {
  const tree = buildLineTree(lex(source));
  return new Parser().parseBlock(tree);
}
