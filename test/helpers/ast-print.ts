import type { Expr, Lambda, Statement, Step } from '../../src/ast.ts';

export function printProgram(statements: Statement[]): string {
  return statements.map(printStatement).join('\n');
}

export function printStatement(statement: Statement): string {
  switch (statement.kind) {
    case 'flowstmt':
      return printExpr(statement.expr);
    case 'proc':
      return `(proc ${statement.name} [${statement.params.join(' ')}] ${printBody(statement.body)})`;
    case 'while':
      return `(while ${printExpr(statement.cond)} ${printBody(statement.body)})`;
    case 'cond':
      return printExpr(statement);
    case 'stop':
      return '(stop)';
  }
}

function printBody(body: Statement[]): string {
  return body.map(printStatement).join(' ');
}

function printLambda(lambda: Lambda): string {
  return `(fn [${lambda.params.join(' ')}] ${printBody(lambda.body)})`;
}

function printStep(step: Step): string {
  if (step.kind === 'bind') return `(${step.outer ? '=>>' : '=>'} ${step.name})`;
  const parts = ['->', printExpr(step.callee), ...step.args.map(printExpr)];
  if (step.body !== null) parts.push(printLambda(step.body));
  return `(${parts.join(' ')})`;
}

export function printExpr(expr: Expr): string {
  switch (expr.kind) {
    case 'int':
      return expr.value.toString();
    case 'float':
      return expr.value.toString().includes('.') ? expr.value.toString() : `${expr.value}.0`;
    case 'string':
      return JSON.stringify(expr.value);
    case 'interp':
      return `(interp ${expr.parts.map((part) => (typeof part === 'string' ? JSON.stringify(part) : printExpr(part))).join(' ')})`;
    case 'char':
      return `\`${expr.value}\``;
    case 'bool':
      return expr.value ? 'yes' : 'no';
    case 'nothing':
      return 'nothing';
    case 'name':
      return expr.name;
    case 'array':
      return `[${expr.items.map(printExpr).join(' ')}]`;
    case 'map':
      return `(map ${expr.entries.map((entry) => `(${printExpr(entry.key)} ${printExpr(entry.value)})`).join(' ')})`;
    case 'binary':
      return `(${expr.op} ${printExpr(expr.left)} ${printExpr(expr.right)})`;
    case 'unary':
      return `(${expr.op === '-' ? 'neg' : 'not'} ${printExpr(expr.operand)})`;
    case 'flow':
      return `(flow ${[printExpr(expr.head), ...expr.steps.map(printStep)].join(' ')})`;
    case 'lambda':
      return printLambda(expr);
    case 'cond': {
      const branches = expr.branches.map((branch) => `(branch ${printExpr(branch.cond)} ${printBody(branch.body)})`);
      if (expr.otherwise !== null) branches.push(`(else ${printBody(expr.otherwise)})`);
      return `(cond ${branches.join(' ')})`;
    }
  }
}
