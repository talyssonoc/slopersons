import type { Expression, Lambda, Statement, Step } from '../../src/ast.ts';

export function printProgram(statements: Statement[]): string {
  return statements.map(printStatement).join('\n');
}

export function printStatement(statement: Statement): string {
  switch (statement.kind) {
    case 'flow-statement':
      return printExpression(statement.expression);
    case 'proc':
      return `(proc ${statement.name} [${statement.parameters.join(' ')}] ${printBody(statement.body)})`;
    case 'while':
      return `(while ${printExpression(statement.condition)} ${printBody(statement.body)})`;
    case 'conditional':
      return printExpression(statement);
    case 'stop':
      return '(stop)';
    case 'attempt':
      return printExpression(statement);
    case 'export':
      return `(export ${statement.names.join(' ')})`;
  }
}

function printBody(body: Statement[]): string {
  return body.map(printStatement).join(' ');
}

function printLambda(lambda: Lambda): string {
  return `(lambda [${lambda.parameters.join(' ')}] ${printBody(lambda.body)})`;
}

function printStep(step: Step): string {
  if (step.kind === 'bind') return `(${step.outer ? '=>>' : '=>'} ${step.name})`;
  const parts = ['->', printExpression(step.callee), ...step.arguments.map(printExpression)];
  if (step.body !== null) parts.push(printLambda(step.body));
  return `(${parts.join(' ')})`;
}

export function printExpression(expression: Expression): string {
  switch (expression.kind) {
    case 'int':
      return expression.value.toString();
    case 'float':
      return expression.value.toString().includes('.') ? expression.value.toString() : `${expression.value}.0`;
    case 'string':
      return JSON.stringify(expression.value);
    case 'interpolation':
      return `(interpolation ${expression.parts.map((part) => (typeof part === 'string' ? JSON.stringify(part) : printExpression(part))).join(' ')})`;
    case 'char':
      return `\`${expression.value}\``;
    case 'boolean':
      return expression.value ? 'yes' : 'no';
    case 'nothing':
      return 'nothing';
    case 'name':
      return expression.name;
    case 'qualified':
      return expression.parts.join('/');
    case 'array':
      return `[${expression.items.map(printExpression).join(' ')}]`;
    case 'map':
      return `(map ${expression.entries.map((entry) => `(${printExpression(entry.key)} ${printExpression(entry.value)})`).join(' ')})`;
    case 'binary':
      return `(${expression.operator} ${printExpression(expression.left)} ${printExpression(expression.right)})`;
    case 'unary':
      return `(${expression.operator === '-' ? 'neg' : 'not'} ${printExpression(expression.operand)})`;
    case 'flow':
      return `(flow ${[printExpression(expression.head), ...expression.steps.map(printStep)].join(' ')})`;
    case 'lambda':
      return printLambda(expression);
    case 'attempt': {
      const handler = expression.handler === null ? '(recover?)' : `(recover${expression.errorName === null ? '' : ` ${expression.errorName}`} ${printBody(expression.handler)})`;
      return `(attempt ${printBody(expression.body)} ${handler})`;
    }
    case 'conditional': {
      const branches = expression.branches.map((branch) => `(branch ${printExpression(branch.condition)} ${printBody(branch.body)})`);
      if (expression.otherwise !== null) branches.push(`(else ${printBody(expression.otherwise)})`);
      return `(conditional ${branches.join(' ')})`;
    }
  }
}
