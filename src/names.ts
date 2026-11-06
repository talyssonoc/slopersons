import type { Expression, Statement, Step } from './ast.ts';
import type { Position } from './errors.ts';
import { stableSort } from './runtime/sorting.ts';

export type NameKind = 'procedure' | 'parameter' | 'variable';

export interface Binding {
  name: string;
  kind: NameKind;
  declaration: Position;
}

export type OccurrenceRole = 'declaration' | 'read' | 'write';

export interface Occurrence {
  name: string;
  position: Position;
  role: OccurrenceRole;
  binding: Binding | null;
}

class Scope {
  private readonly bindings = new Map<string, Binding>();
  private readonly parent: Scope | null;

  constructor(parent: Scope | null) {
    this.parent = parent;
  }

  own(name: string): Binding | undefined {
    return this.bindings.get(name);
  }

  add(binding: Binding): void {
    this.bindings.set(binding.name, binding);
  }

  find(name: string): Binding | null {
    let scope: Scope | null = this;
    while (scope !== null) {
      const binding = scope.own(name);
      if (binding !== undefined) return binding;
      scope = scope.parent;
    }
    return null;
  }

  visible(): Binding[] {
    const seen = new Set<string>();
    const bindings: Binding[] = [];
    let scope: Scope | null = this;
    while (scope !== null) {
      for (const binding of scope.bindings.values()) {
        if (seen.has(binding.name)) continue;
        seen.add(binding.name);
        bindings.push(binding);
      }
      scope = scope.parent;
    }
    return bindings;
  }
}

interface Declared {
  name: string;
  position: Position;
}

function declaredAll(names: string[], positions: Position[]): Declared[] {
  const declared: Declared[] = [];
  names.forEach((name, index) => {
    const position = positions[index];
    if (position !== undefined) declared.push({ name, position });
  });
  return declared;
}

// A binding exists from when its statement runs, so a use sees only the declarations before it in its
// own scope. A procedure or lambda body runs later, so it is resolved once the scope around it has
// been read and sees every declaration there. Exports are collected after a module has run.
class Resolver {
  readonly occurrences: Occurrence[] = [];
  private pending: Array<() => void> = [];
  private readonly probe: string | null;
  visibleAtProbe: Binding[] | null = null;

  constructor(probe: string | null) {
    this.probe = probe;
  }

  resolveScope(parent: Scope | null, parameters: Declared[], body: Statement[]): void {
    const scope = new Scope(parent);
    for (const parameter of parameters) this.define(scope, parameter, 'parameter');
    const outer = this.pending;
    this.pending = [];
    this.statements(body, scope);
    const deferred = this.pending;
    this.pending = outer;
    for (const resolve of deferred) resolve();
  }

  private define(scope: Scope, declared: Declared, kind: NameKind): void {
    const existing = scope.own(declared.name);
    if (existing !== undefined) {
      this.occurrences.push({ name: declared.name, position: declared.position, role: 'write', binding: existing });
      return;
    }
    const binding: Binding = { name: declared.name, kind, declaration: declared.position };
    scope.add(binding);
    this.occurrences.push({ name: declared.name, position: declared.position, role: 'declaration', binding });
  }

  private use(scope: Scope, name: string, position: Position, role: 'read' | 'write'): void {
    if (name === this.probe && this.visibleAtProbe === null) this.visibleAtProbe = scope.visible();
    this.occurrences.push({ name, position, role, binding: scope.find(name) });
  }

  private nested(scope: Scope, parameters: Declared[], body: Statement[]): void {
    this.pending.push(() => this.resolveScope(scope, parameters, body));
  }

  private statements(statements: Statement[] | null, scope: Scope): void {
    for (const statement of statements ?? []) this.statement(statement, scope);
  }

  private statement(statement: Statement, scope: Scope): void {
    switch (statement.kind) {
      case 'proc':
        this.define(scope, { name: statement.name, position: statement.namePosition }, 'procedure');
        this.nested(scope, declaredAll(statement.parameters, statement.parameterPositions), statement.body);
        return;
      case 'while':
        this.expression(statement.condition, scope);
        this.statements(statement.body, scope);
        return;
      case 'flow-statement':
        this.expression(statement.expression, scope);
        return;
      case 'conditional':
      case 'attempt':
        this.expression(statement, scope);
        return;
      case 'export':
        for (const exported of declaredAll(statement.names, statement.namePositions)) this.pending.push(() => this.use(scope, exported.name, exported.position, 'read'));
        return;
      case 'stop':
        return;
      default:
        return statement satisfies never;
    }
  }

  private step(step: Step, scope: Scope): void {
    if (step.kind === 'bind') {
      if (step.outer) this.use(scope, step.name, step.namePosition, 'write');
      else this.define(scope, { name: step.name, position: step.namePosition }, 'variable');
      return;
    }
    this.expression(step.callee, scope);
    for (const input of step.arguments) this.expression(input, scope);
    if (step.body !== null) this.expression(step.body, scope);
  }

  private expression(expression: Expression, scope: Scope): void {
    switch (expression.kind) {
      case 'int':
      case 'float':
      case 'string':
      case 'char':
      case 'boolean':
      case 'nothing':
        return;
      case 'name':
        this.use(scope, expression.name, expression.position, 'read');
        return;
      case 'qualified':
        this.use(scope, expression.parts[0] ?? '', expression.position, 'read');
        return;
      case 'interpolation':
        for (const part of expression.parts) if (typeof part !== 'string') this.expression(part, scope);
        return;
      case 'array':
        for (const item of expression.items) this.expression(item, scope);
        return;
      case 'map':
        for (const entry of expression.entries) {
          this.expression(entry.key, scope);
          this.expression(entry.value, scope);
        }
        return;
      case 'binary':
        this.expression(expression.left, scope);
        this.expression(expression.right, scope);
        return;
      case 'unary':
        this.expression(expression.operand, scope);
        return;
      case 'flow':
        this.expression(expression.head, scope);
        for (const step of expression.steps) this.step(step, scope);
        return;
      case 'lambda':
        this.nested(scope, declaredAll(expression.parameters, expression.parameterPositions), expression.body);
        return;
      case 'conditional':
        for (const branch of expression.branches) {
          this.expression(branch.condition, scope);
          this.statements(branch.body, scope);
        }
        this.statements(expression.otherwise, scope);
        return;
      case 'attempt':
        this.statements(expression.body, scope);
        if (expression.errorName !== null && expression.errorNamePosition !== null) {
          this.define(scope, { name: expression.errorName, position: expression.errorNamePosition }, 'variable');
        }
        this.statements(expression.handler, scope);
        this.statements(expression.cleanup, scope);
        return;
      default:
        return expression satisfies never;
    }
  }
}

export function resolveNames(program: Statement[]): Occurrence[] {
  const resolver = new Resolver(null);
  resolver.resolveScope(null, [], program);
  return stableSort(resolver.occurrences, (first, second) => first.position.line - second.position.line || first.position.col - second.position.col);
}

export function bindingsVisibleAt(program: Statement[], probe: string): Binding[] | null {
  const resolver = new Resolver(probe);
  resolver.resolveScope(null, [], program);
  return resolver.visibleAtProbe;
}
