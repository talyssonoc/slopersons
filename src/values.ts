import type { Statement } from './ast.ts';
import type { Pos } from './errors.ts';
import { runtimeError } from './errors.ts';
import type { CallContext, Env } from './interpreter.ts';
import { civilFromDays, formatDate } from './runtime/calendar.ts';
import { hashBigInt, hashBoolean, hashCombine, hashNumber, hashString } from './runtime/hashing.ts';
import { HashTable, type KeyOps } from './runtime/hashtable.ts';
import { codePoints, formatFloat } from './runtime/text.ts';

export interface IntValue {
  t: 'int';
  v: bigint;
}

export interface FloatValue {
  t: 'float';
  v: number;
}

export interface CharValue {
  t: 'char';
  v: string;
}

export interface BoolValue {
  t: 'bool';
  v: boolean;
}

export interface StringValue {
  t: 'string';
  v: string;
}

export interface NothingValue {
  t: 'nothing';
}

export interface ArrayValue {
  t: 'array';
  items: Value[];
}

export interface MapValue {
  t: 'map';
  table: HashTable<Value, Value>;
}

export interface SetValue {
  t: 'set';
  table: HashTable<Value, true>;
}

export interface DateValue {
  t: 'date';
  days: number;
}

export interface ProcValue {
  t: 'proc';
  id: number;
  name: string | null;
  params: string[];
  body: Statement[];
  env: Env;
  isProc: boolean;
}

export interface Arity {
  min: number;
  max: number | null;
}

export type BuiltinFn = (args: Value[], ctx: CallContext) => Value;

export interface BuiltinValue {
  t: 'builtin';
  id: number;
  name: string;
  arity: Arity;
  fn: BuiltinFn;
}

export type Value =
  | IntValue
  | FloatValue
  | CharValue
  | BoolValue
  | StringValue
  | NothingValue
  | ArrayValue
  | MapValue
  | SetValue
  | DateValue
  | ProcValue
  | BuiltinValue;

export type TypeName = 'int' | 'float' | 'char' | 'boolean' | 'string' | 'nothing' | 'array' | 'hashmap' | 'set' | 'date' | 'proc';

export const NOTHING: NothingValue = { t: 'nothing' };
export const YES: BoolValue = { t: 'bool', v: true };
export const NO: BoolValue = { t: 'bool', v: false };

let nextId = 1;

export function freshId(): number {
  return nextId++;
}

export function int(v: bigint): IntValue {
  return { t: 'int', v };
}

export function float(v: number): FloatValue {
  return { t: 'float', v };
}

export function char(v: string): CharValue {
  return { t: 'char', v };
}

export function bool(v: boolean): BoolValue {
  return v ? YES : NO;
}

export function str(v: string): StringValue {
  return { t: 'string', v };
}

export function array(items: Value[]): ArrayValue {
  return { t: 'array', items };
}

export function date(days: number): DateValue {
  return { t: 'date', days };
}

export function typeName(value: Value): TypeName {
  switch (value.t) {
    case 'bool':
      return 'boolean';
    case 'map':
      return 'hashmap';
    case 'builtin':
      return 'proc';
    default:
      return value.t;
  }
}

export function valuesEqual(a: Value, b: Value): boolean {
  if (a.t !== b.t) return false;
  switch (a.t) {
    case 'int':
      return a.v === (b as IntValue).v;
    case 'float':
      return a.v === (b as FloatValue).v;
    case 'char':
    case 'string':
      return a.v === (b as CharValue | StringValue).v;
    case 'bool':
      return a.v === (b as BoolValue).v;
    case 'nothing':
      return true;
    case 'date':
      return a.days === (b as DateValue).days;
    case 'array': {
      const other = b as ArrayValue;
      if (a.items.length !== other.items.length) return false;
      for (let i = 0; i < a.items.length; i++) {
        const left = a.items[i];
        const right = other.items[i];
        if (left === undefined || right === undefined || !valuesEqual(left, right)) return false;
      }
      return true;
    }
    case 'map': {
      const other = b as MapValue;
      if (a.table.size !== other.table.size) return false;
      for (const [key, value] of a.table.entries()) {
        const found = other.table.get(key);
        if (found === undefined || !valuesEqual(value, found)) return false;
      }
      return true;
    }
    case 'set': {
      const other = b as SetValue;
      if (a.table.size !== other.table.size) return false;
      for (const key of a.table.keys()) {
        if (!other.table.has(key)) return false;
      }
      return true;
    }
    case 'proc':
    case 'builtin':
      return a === b;
  }
}

const TAG_HASH: Record<Value['t'], number> = {
  int: 1,
  float: 2,
  char: 3,
  bool: 4,
  string: 5,
  nothing: 6,
  array: 7,
  map: 8,
  set: 9,
  date: 10,
  proc: 11,
  builtin: 12,
};

export function hashValue(value: Value): number {
  const tag = TAG_HASH[value.t];
  switch (value.t) {
    case 'int':
      return hashCombine(tag, hashBigInt(value.v));
    case 'float':
      return hashCombine(tag, hashNumber(value.v));
    case 'char':
    case 'string':
      return hashCombine(tag, hashString(value.v));
    case 'bool':
      return hashCombine(tag, hashBoolean(value.v));
    case 'nothing':
      return hashCombine(tag, 0);
    case 'date':
      return hashCombine(tag, hashNumber(value.days));
    case 'array': {
      let h = tag;
      for (const item of value.items) h = hashCombine(h, hashValue(item));
      return h;
    }
    case 'map': {
      let sum = 0;
      for (const [key, item] of value.table.entries()) sum = (sum + hashCombine(hashValue(key), hashValue(item))) >>> 0;
      return hashCombine(tag, sum);
    }
    case 'set': {
      let sum = 0;
      for (const key of value.table.keys()) sum = (sum + hashValue(key)) >>> 0;
      return hashCombine(tag, sum);
    }
    case 'proc':
    case 'builtin':
      return hashCombine(tag, value.id);
  }
}

export const valueKeyOps: KeyOps<Value> = { hash: hashValue, equals: valuesEqual };

export function newMap(): MapValue {
  return { t: 'map', table: new HashTable<Value, Value>(valueKeyOps) };
}

export function newSet(): SetValue {
  return { t: 'set', table: new HashTable<Value, true>(valueKeyOps) };
}

function compareNumbers(a: IntValue | FloatValue, b: IntValue | FloatValue): number {
  if (a.t === 'int' && b.t === 'int') return a.v < b.v ? -1 : a.v > b.v ? 1 : 0;
  if (a.t === 'float' && b.t === 'float') return a.v < b.v ? -1 : a.v > b.v ? 1 : 0;
  const [i, f, sign] = a.t === 'int' ? [a.v, (b as FloatValue).v, 1] : [(b as IntValue).v, a.v, -1];
  if (Number.isInteger(f)) {
    const fb = BigInt(f);
    return sign * (i < fb ? -1 : i > fb ? 1 : 0);
  }
  const fi = Number(i);
  return sign * (fi < f ? -1 : fi > f ? 1 : 0);
}

function compareStrings(a: string, b: string): number {
  const left = codePoints(a);
  const right = codePoints(b);
  const n = Math.min(left.length, right.length);
  for (let i = 0; i < n; i++) {
    const l = left[i]?.codePointAt(0) ?? 0;
    const r = right[i]?.codePointAt(0) ?? 0;
    if (l !== r) return l < r ? -1 : 1;
  }
  return left.length < right.length ? -1 : left.length > right.length ? 1 : 0;
}

export function compareValues(a: Value, b: Value, pos: Pos | null): number {
  if ((a.t === 'int' || a.t === 'float') && (b.t === 'int' || b.t === 'float')) return compareNumbers(a, b);
  if (a.t === 'string' && b.t === 'string') return compareStrings(a.v, b.v);
  if (a.t === 'char' && b.t === 'char') return compareStrings(a.v, b.v);
  if (a.t === 'date' && b.t === 'date') return a.days < b.days ? -1 : a.days > b.days ? 1 : 0;
  if (a.t === 'array' && b.t === 'array') {
    const n = Math.min(a.items.length, b.items.length);
    for (let i = 0; i < n; i++) {
      const left = a.items[i];
      const right = b.items[i];
      if (left === undefined || right === undefined) break;
      const c = compareValues(left, right, pos);
      if (c !== 0) return c;
    }
    return a.items.length < b.items.length ? -1 : a.items.length > b.items.length ? 1 : 0;
  }
  throw runtimeError(`cannot compare ${describeType(a)} with ${describeType(b)}`, pos);
}

export function describeType(value: Value): string {
  const name = typeName(value);
  return name === 'int' || name === 'array' ? `an ${name}` : `a ${name}`;
}

export type FormatMode = 'print' | 'show';

function escapeString(s: string): string {
  let out = '"';
  for (const cp of s) {
    switch (cp) {
      case '"':
        out += '\\"';
        break;
      case '\\':
        out += '\\\\';
        break;
      case '\n':
        out += '\\n';
        break;
      case '\t':
        out += '\\t';
        break;
      case '\r':
        out += '\\r';
        break;
      case '{':
        out += '\\{';
        break;
      case '}':
        out += '\\}';
        break;
      default:
        out += cp;
    }
  }
  return `${out}"`;
}

function escapeChar(c: string): string {
  switch (c) {
    case '\n':
      return '`\\n`';
    case '\t':
      return '`\\t`';
    case '\r':
      return '`\\r`';
    case '\\':
      return '`\\\\`';
    case '`':
      return '`\\``';
    default:
      return `\`${c}\``;
  }
}

export function formatDateValue(value: DateValue): string {
  return formatDate(civilFromDays(value.days), 'yyyy-mm-dd');
}

export function formatValue(value: Value, mode: FormatMode): string {
  switch (value.t) {
    case 'int':
      return value.v.toString();
    case 'float':
      return formatFloat(value.v);
    case 'char':
      return mode === 'print' ? value.v : escapeChar(value.v);
    case 'bool':
      return value.v ? 'yes' : 'no';
    case 'string':
      return mode === 'print' ? value.v : escapeString(value.v);
    case 'nothing':
      return 'nothing';
    case 'date':
      return formatDateValue(value);
    case 'array':
      return `[${value.items.map((item) => formatValue(item, 'show')).join(' ')}]`;
    case 'map':
      return `{${value.table
        .entries()
        .map(([key, item]) => `${formatValue(key, 'show')}: ${formatValue(item, 'show')}`)
        .join('  ')}}`;
    case 'set':
      return `set[${value.table
        .keys()
        .map((key) => formatValue(key, 'show'))
        .join(' ')}]`;
    case 'proc':
      return value.name === null ? '<lambda>' : `<proc ${value.name}>`;
    case 'builtin':
      return `<proc ${value.name}>`;
  }
}
