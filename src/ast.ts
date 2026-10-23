import type { Position } from './errors.ts';

export type Statement = ProcedureDefinition | WhileStatement | Conditional | FlowStatement | StopStatement | AttemptStatement | ExportStatement;

export interface ProcedureDefinition {
  kind: 'proc';
  name: string;
  parameters: string[];
  body: Statement[];
  position: Position;
}

export interface WhileStatement {
  kind: 'while';
  condition: Expression;
  body: Statement[];
  position: Position;
}

export interface Branch {
  condition: Expression;
  body: Statement[];
}

export interface Conditional {
  kind: 'conditional';
  branches: Branch[];
  otherwise: Statement[] | null;
  position: Position;
}

export interface FlowStatement {
  kind: 'flow-statement';
  expression: Expression;
}

export interface StopStatement {
  kind: 'stop';
  position: Position;
}

export interface ExportStatement {
  kind: 'export';
  names: string[];
  position: Position;
}

export interface AttemptStatement {
  kind: 'attempt';
  body: Statement[];
  errorName: string | null;
  handler: Statement[] | null;
  cleanup: Statement[] | null;
  position: Position;
}

export type Step = CallStep | BindStep;

export interface CallStep {
  kind: 'call';
  callee: Expression;
  arguments: Expression[];
  body: Lambda | null;
  position: Position;
}

export interface BindStep {
  kind: 'bind';
  name: string;
  outer: boolean;
  position: Position;
}

export type Expression =
  | IntLiteral
  | FloatLiteral
  | StringLiteral
  | InterpString
  | CharLiteral
  | BooleanLiteral
  | NothingLiteral
  | Name
  | QualifiedName
  | ArrayLiteral
  | MapLiteral
  | Binary
  | Unary
  | Flow
  | Lambda
  | Conditional
  | AttemptStatement;

export interface IntLiteral {
  kind: 'int';
  value: bigint;
  position: Position;
}

export interface FloatLiteral {
  kind: 'float';
  value: number;
  position: Position;
}

export interface StringLiteral {
  kind: 'string';
  value: string;
  position: Position;
}

export interface InterpString {
  kind: 'interpolation';
  parts: Array<string | Expression>;
  position: Position;
}

export interface CharLiteral {
  kind: 'char';
  value: string;
  position: Position;
}

export interface BooleanLiteral {
  kind: 'boolean';
  value: boolean;
  position: Position;
}

export interface NothingLiteral {
  kind: 'nothing';
  position: Position;
}

export interface Name {
  kind: 'name';
  name: string;
  position: Position;
}

export interface QualifiedName {
  kind: 'qualified';
  parts: string[];
  position: Position;
}

export interface ArrayLiteral {
  kind: 'array';
  items: Expression[];
  position: Position;
}

export interface MapEntry {
  key: Expression;
  value: Expression;
}

export interface MapLiteral {
  kind: 'map';
  entries: MapEntry[];
  position: Position;
}

export type BinaryOp = '+' | '-' | '*' | '/' | 'mod' | '=' | '/=' | '<' | '>' | '<=' | '>=' | 'and' | 'or';

export interface Binary {
  kind: 'binary';
  operator: BinaryOp;
  left: Expression;
  right: Expression;
  position: Position;
}

export type UnaryOp = '-' | 'not';

export interface Unary {
  kind: 'unary';
  operator: UnaryOp;
  operand: Expression;
  position: Position;
}

export interface Flow {
  kind: 'flow';
  head: Expression;
  steps: Step[];
  position: Position;
}

export interface Lambda {
  kind: 'lambda';
  parameters: string[];
  body: Statement[];
  position: Position;
}
