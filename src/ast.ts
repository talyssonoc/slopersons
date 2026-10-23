import type { Pos } from './errors.ts';

export type Statement = ProcDef | WhileStmt | Conditional | FlowStmt | StopStmt;

export interface ProcDef {
  kind: 'proc';
  name: string;
  params: string[];
  body: Statement[];
  pos: Pos;
}

export interface WhileStmt {
  kind: 'while';
  cond: Expr;
  body: Statement[];
  pos: Pos;
}

export interface Branch {
  cond: Expr;
  body: Statement[];
}

export interface Conditional {
  kind: 'cond';
  branches: Branch[];
  otherwise: Statement[] | null;
  pos: Pos;
}

export interface FlowStmt {
  kind: 'flowstmt';
  expr: Expr;
}

export interface StopStmt {
  kind: 'stop';
  pos: Pos;
}

export type Step = CallStep | BindStep;

export interface CallStep {
  kind: 'call';
  callee: Expr;
  args: Expr[];
  body: Lambda | null;
  pos: Pos;
}

export interface BindStep {
  kind: 'bind';
  name: string;
  outer: boolean;
  pos: Pos;
}

export type Expr =
  | IntLit
  | FloatLit
  | StringLit
  | InterpString
  | CharLit
  | BoolLit
  | NothingLit
  | Name
  | ArrayLit
  | MapLit
  | Binary
  | Unary
  | Flow
  | Lambda
  | Conditional;

export interface IntLit {
  kind: 'int';
  value: bigint;
  pos: Pos;
}

export interface FloatLit {
  kind: 'float';
  value: number;
  pos: Pos;
}

export interface StringLit {
  kind: 'string';
  value: string;
  pos: Pos;
}

export interface InterpString {
  kind: 'interp';
  parts: Array<string | Expr>;
  pos: Pos;
}

export interface CharLit {
  kind: 'char';
  value: string;
  pos: Pos;
}

export interface BoolLit {
  kind: 'bool';
  value: boolean;
  pos: Pos;
}

export interface NothingLit {
  kind: 'nothing';
  pos: Pos;
}

export interface Name {
  kind: 'name';
  name: string;
  pos: Pos;
}

export interface ArrayLit {
  kind: 'array';
  items: Expr[];
  pos: Pos;
}

export interface MapEntry {
  key: Expr;
  value: Expr;
}

export interface MapLit {
  kind: 'map';
  entries: MapEntry[];
  pos: Pos;
}

export type BinaryOp = '+' | '-' | '*' | '/' | 'mod' | '=' | '/=' | '<' | '>' | '<=' | '>=' | 'and' | 'or';

export interface Binary {
  kind: 'binary';
  op: BinaryOp;
  left: Expr;
  right: Expr;
  pos: Pos;
}

export type UnaryOp = '-' | 'not';

export interface Unary {
  kind: 'unary';
  op: UnaryOp;
  operand: Expr;
  pos: Pos;
}

export interface Flow {
  kind: 'flow';
  head: Expr;
  steps: Step[];
  pos: Pos;
}

export interface Lambda {
  kind: 'lambda';
  params: string[];
  body: Statement[];
  pos: Pos;
}
