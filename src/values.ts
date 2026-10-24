import type { Statement } from './ast.ts';
import type { Position } from './errors.ts';
import { runtimeError, type SlopersonsError } from './errors.ts';
import type { CallContext, Environment } from './interpreter.ts';
import { civilFromDays, formatDate } from './runtime/calendar.ts';
import { hashBigInt, hashBoolean, hashCombine, hashNumber, hashString } from './runtime/hashing.ts';
import { HashTable, type KeyOperations } from './runtime/hashtable.ts';
import type { Listener } from './runtime/network.ts';
import type { Stream } from './runtime/stream.ts';
import { codePoints, formatFloat } from './runtime/text.ts';
import { isoDateTime, isoTime } from './runtime/time.ts';

export interface IntValue {
  type: 'int';
  value: bigint;
}

export interface FloatValue {
  type: 'float';
  value: number;
}

export interface CharValue {
  type: 'char';
  value: string;
}

export interface BooleanValue {
  type: 'boolean';
  value: boolean;
}

export interface StringValue {
  type: 'string';
  value: string;
}

export interface NothingValue {
  type: 'nothing';
}

export interface ArrayValue {
  type: 'array';
  items: Value[];
}

export interface MapValue {
  type: 'map';
  table: HashTable<Value, Value>;
}

export interface SetValue {
  type: 'set';
  table: HashTable<Value, true>;
}

export interface DateValue {
  type: 'date';
  days: number;
}

export interface TimeValue {
  type: 'time';
  milliseconds: number;
}

export interface DateTimeValue {
  type: 'datetime';
  milliseconds: number;
}

export interface ModuleValue {
  type: 'module';
  id: number;
  name: string;
  path: string;
  members: Map<string, Value>;
}

export interface StreamValue {
  type: 'stream';
  id: number;
  stream: Stream;
}

export interface ListenerValue {
  type: 'listener';
  id: number;
  listener: Listener;
}

export interface ErrorValue {
  type: 'error';
  message: string;
  position: Position | null;
}

export interface ProcedureValue {
  type: 'proc';
  id: number;
  name: string | null;
  parameters: string[];
  body: Statement[];
  environment: Environment;
  isProc: boolean;
}

export interface Arity {
  min: number;
  max: number | null;
}

export type BuiltinImplementation = (inputs: Value[], context: CallContext) => Value;

export interface BuiltinValue {
  type: 'builtin';
  id: number;
  name: string;
  arity: Arity;
  implementation: BuiltinImplementation;
}

export type Value =
  | IntValue
  | FloatValue
  | CharValue
  | BooleanValue
  | StringValue
  | NothingValue
  | ArrayValue
  | MapValue
  | SetValue
  | DateValue
  | TimeValue
  | DateTimeValue
  | ErrorValue
  | ModuleValue
  | StreamValue
  | ListenerValue
  | ProcedureValue
  | BuiltinValue;

export type TypeName = 'int' | 'float' | 'char' | 'boolean' | 'string' | 'nothing' | 'array' | 'hashmap' | 'set' | 'date' | 'time' | 'datetime' | 'error' | 'module' | 'stream' | 'listener' | 'proc';

export const NOTHING: NothingValue = { type: 'nothing' };
export const YES: BooleanValue = { type: 'boolean', value: true };
export const NO: BooleanValue = { type: 'boolean', value: false };

let nextId = 1;

export function freshId(): number {
  return nextId++;
}

export function int(item: bigint): IntValue {
  return { type: 'int', value: item };
}

export function float(item: number): FloatValue {
  return { type: 'float', value: item };
}

export function char(item: string): CharValue {
  return { type: 'char', value: item };
}

export function boolean(value: boolean): BooleanValue {
  return value ? YES : NO;
}

export function string(item: string): StringValue {
  return { type: 'string', value: item };
}

export function array(items: Value[]): ArrayValue {
  return { type: 'array', items };
}

export function date(days: number): DateValue {
  return { type: 'date', days };
}

export function time(milliseconds: number): TimeValue {
  return { type: 'time', milliseconds };
}

export function datetime(milliseconds: number): DateTimeValue {
  return { type: 'datetime', milliseconds };
}

export function streamValue(stream: Stream): StreamValue {
  return { type: 'stream', id: freshId(), stream };
}

export function listenerValue(listener: Listener): ListenerValue {
  return { type: 'listener', id: freshId(), listener };
}

export function errorValue(error: SlopersonsError): ErrorValue {
  return { type: 'error', message: error.message, position: error.position };
}

export function typeName(value: Value): TypeName {
  switch (value.type) {
    case 'boolean':
      return 'boolean';
    case 'map':
      return 'hashmap';
    case 'builtin':
      return 'proc';
    default:
      return value.type;
  }
}

export function valuesEqual(first: Value, second: Value): boolean {
  if (first.type !== second.type) return false;
  switch (first.type) {
    case 'int':
      return first.value === (second as IntValue).value;
    case 'float':
      return first.value === (second as FloatValue).value;
    case 'char':
    case 'string':
      return first.value === (second as CharValue | StringValue).value;
    case 'boolean':
      return first.value === (second as BooleanValue).value;
    case 'nothing':
      return true;
    case 'date':
      return first.days === (second as DateValue).days;
    case 'time':
    case 'datetime':
      return first.milliseconds === (second as TimeValue | DateTimeValue).milliseconds;
    case 'error': {
      const other = second as ErrorValue;
      return first.message === other.message && first.position?.line === other.position?.line && first.position?.col === other.position?.col;
    }
    case 'array': {
      const other = second as ArrayValue;
      if (first.items.length !== other.items.length) return false;
      for (let i = 0; i < first.items.length; i++) {
        const left = first.items[i];
        const right = other.items[i];
        if (left === undefined || right === undefined || !valuesEqual(left, right)) return false;
      }
      return true;
    }
    case 'map': {
      const other = second as MapValue;
      if (first.table.size !== other.table.size) return false;
      for (const [key, value] of first.table.entries()) {
        const found = other.table.get(key);
        if (found === undefined || !valuesEqual(value, found)) return false;
      }
      return true;
    }
    case 'set': {
      const other = second as SetValue;
      if (first.table.size !== other.table.size) return false;
      for (const key of first.table.keys()) {
        if (!other.table.has(key)) return false;
      }
      return true;
    }
    case 'proc':
    case 'builtin':
    case 'module':
    case 'stream':
    case 'listener':
      return first === second;
  }
}

const TAG_HASH: Record<Value['type'], number> = {
  int: 1,
  float: 2,
  char: 3,
  boolean: 4,
  string: 5,
  nothing: 6,
  array: 7,
  map: 8,
  set: 9,
  date: 10,
  proc: 11,
  builtin: 12,
  time: 13,
  datetime: 14,
  error: 15,
  module: 16,
  stream: 17,
  listener: 18,
};

export function hashValue(value: Value): number {
  const tag = TAG_HASH[value.type];
  switch (value.type) {
    case 'int':
      return hashCombine(tag, hashBigInt(value.value));
    case 'float':
      return hashCombine(tag, hashNumber(value.value));
    case 'char':
    case 'string':
      return hashCombine(tag, hashString(value.value));
    case 'boolean':
      return hashCombine(tag, hashBoolean(value.value));
    case 'nothing':
      return hashCombine(tag, 0);
    case 'date':
      return hashCombine(tag, hashNumber(value.days));
    case 'time':
    case 'datetime':
      return hashCombine(tag, hashNumber(value.milliseconds));
    case 'error':
      return hashCombine(tag, hashString(value.message));
    case 'array': {
      let hash = tag;
      for (const item of value.items) hash = hashCombine(hash, hashValue(item));
      return hash;
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
    case 'module':
    case 'stream':
    case 'listener':
      return hashCombine(tag, value.id);
  }
}

export const valueKeyOperations: KeyOperations<Value> = { hash: hashValue, equals: valuesEqual };

export function newMap(): MapValue {
  return { type: 'map', table: new HashTable<Value, Value>(valueKeyOperations) };
}

export function newSet(): SetValue {
  return { type: 'set', table: new HashTable<Value, true>(valueKeyOperations) };
}

function compareNumbers(left: IntValue | FloatValue, right: IntValue | FloatValue): number {
  if (left.type === 'int' && right.type === 'int') return left.value < right.value ? -1 : left.value > right.value ? 1 : 0;
  if (left.type === 'float' && right.type === 'float') return left.value < right.value ? -1 : left.value > right.value ? 1 : 0;
  const [intOperand, floatOperand, sign] = left.type === 'int' ? [left.value, (right as FloatValue).value, 1] : [(right as IntValue).value, left.value, -1];
  if (Number.isInteger(floatOperand)) {
    const floatAsBigInt = BigInt(floatOperand);
    return sign * (intOperand < floatAsBigInt ? -1 : intOperand > floatAsBigInt ? 1 : 0);
  }
  const intAsFloat = Number(intOperand);
  return sign * (intAsFloat < floatOperand ? -1 : intAsFloat > floatOperand ? 1 : 0);
}

function compareStrings(first: string, second: string): number {
  const left = codePoints(first);
  const right = codePoints(second);
  const shared = Math.min(left.length, right.length);
  for (let i = 0; i < shared; i++) {
    const leftCodePoint = left[i]?.codePointAt(0) ?? 0;
    const rightCodePoint = right[i]?.codePointAt(0) ?? 0;
    if (leftCodePoint !== rightCodePoint) return leftCodePoint < rightCodePoint ? -1 : 1;
  }
  return left.length < right.length ? -1 : left.length > right.length ? 1 : 0;
}

export function compareValues(first: Value, second: Value, position: Position | null): number {
  if ((first.type === 'int' || first.type === 'float') && (second.type === 'int' || second.type === 'float')) return compareNumbers(first, second);
  if (first.type === 'string' && second.type === 'string') return compareStrings(first.value, second.value);
  if (first.type === 'char' && second.type === 'char') return compareStrings(first.value, second.value);
  if (first.type === 'date' && second.type === 'date') return first.days < second.days ? -1 : first.days > second.days ? 1 : 0;
  if ((first.type === 'time' && second.type === 'time') || (first.type === 'datetime' && second.type === 'datetime')) return first.milliseconds < second.milliseconds ? -1 : first.milliseconds > second.milliseconds ? 1 : 0;
  if (first.type === 'array' && second.type === 'array') {
    const shared = Math.min(first.items.length, second.items.length);
    for (let i = 0; i < shared; i++) {
      const left = first.items[i];
      const right = second.items[i];
      if (left === undefined || right === undefined) break;
      const cursor = compareValues(left, right, position);
      if (cursor !== 0) return cursor;
    }
    return first.items.length < second.items.length ? -1 : first.items.length > second.items.length ? 1 : 0;
  }
  throw runtimeError(`cannot compare ${describeType(first)} with ${describeType(second)}`, position);
}

export function describeType(value: Value): string {
  const name = typeName(value);
  return name === 'int' || name === 'array' || name === 'error' ? `an ${name}` : `a ${name}`;
}

export type FormatMode = 'print' | 'show';

function escapeString(text: string): string {
  let out = '"';
  for (const codePoint of text) {
    switch (codePoint) {
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
        out += codePoint;
    }
  }
  return `${out}"`;
}

function escapeChar(cursor: string): string {
  switch (cursor) {
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
      return `\`${cursor}\``;
  }
}

export function formatDateValue(value: DateValue): string {
  return formatDate(civilFromDays(value.days), 'yyyy-mm-dd');
}

export function formatValue(value: Value, mode: FormatMode): string {
  switch (value.type) {
    case 'int':
      return value.value.toString();
    case 'float':
      return formatFloat(value.value);
    case 'char':
      return mode === 'print' ? value.value : escapeChar(value.value);
    case 'boolean':
      return value.value ? 'yes' : 'no';
    case 'string':
      return mode === 'print' ? value.value : escapeString(value.value);
    case 'nothing':
      return 'nothing';
    case 'date':
      return formatDateValue(value);
    case 'time':
      return isoTime(value.milliseconds);
    case 'datetime':
      return isoDateTime(value.milliseconds);
    case 'error':
      return mode === 'print' ? value.message : `<error ${value.message}>`;
    case 'module':
      return `<module ${value.name}>`;
    case 'stream':
      return `<stream ${value.stream.label}>`;
    case 'listener':
      return `<listener ${value.listener.address}>`;
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
