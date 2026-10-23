import { runtimeError } from '../errors.ts';
import type { CallContext, Interpreter } from '../interpreter.ts';
import type { HashTable } from '../runtime/hashtable.ts';
import { NOTHING, array, bool, describeType, formatValue, int, newMap, type MapValue, type Value } from '../values.ts';
import { arg, callLambda, expectDecision, expectProc, runLoopBody } from './core.ts';

function expectMap(value: Value, what: string, ctx: CallContext): MapValue {
  if (value.t !== 'map') throw runtimeError(`${what} must be a hashmap, got ${describeType(value)}`, ctx.pos);
  return value;
}

function expectCondition(value: Value, name: string, ctx: CallContext): boolean {
  return expectDecision(value, `the condition in \`${name}\``, ctx);
}

function mapOf(table: HashTable<Value, Value>): MapValue {
  return { t: 'map', table };
}

function entryPairs(map: MapValue): Value {
  return array(map.table.entries().map(([key, value]) => array([key, value])));
}

export function registerHashmap(interp: Interpreter): void {
  interp.defineMethod('at', 'hashmap', 2, (args, ctx) => {
    const map = expectMap(arg(args, 0), 'the input of `at`', ctx);
    const key = arg(args, 1);
    const found = map.table.get(key);
    if (found === undefined) throw runtimeError(`key ${formatValue(key, 'show')} not found in hashmap`, ctx.pos);
    return found;
  });

  interp.defineMethod('at-or', 'hashmap', 3, (args, ctx) => {
    const map = expectMap(arg(args, 0), 'the input of `at-or`', ctx);
    return map.table.get(arg(args, 1)) ?? arg(args, 2);
  });

  interp.defineMethod('put', 'hashmap', 3, (args, ctx) => {
    const map = expectMap(arg(args, 0), 'the input of `put`', ctx);
    map.table.set(arg(args, 1), arg(args, 2));
    return map;
  });

  interp.defineMethod('remove', 'hashmap', 2, (args, ctx) => {
    const map = expectMap(arg(args, 0), 'the input of `remove`', ctx);
    map.table.delete(arg(args, 1));
    return map;
  });

  interp.defineMethod('has', 'hashmap', 2, (args, ctx) => {
    const map = expectMap(arg(args, 0), 'the input of `has`', ctx);
    return bool(map.table.has(arg(args, 1)));
  });

  interp.defineMethod('keys', 'hashmap', 1, (args, ctx) => array(expectMap(arg(args, 0), 'the input of `keys`', ctx).table.keys()));

  interp.defineMethod('values', 'hashmap', 1, (args, ctx) => array(expectMap(arg(args, 0), 'the input of `values`', ctx).table.values()));

  interp.defineMethod('entries', 'hashmap', 1, (args, ctx) => entryPairs(expectMap(arg(args, 0), 'the input of `entries`', ctx)));

  interp.defineMethod('to-array', 'hashmap', 1, (args, ctx) => entryPairs(expectMap(arg(args, 0), 'the input of `to-array`', ctx)));

  interp.defineMethod('length', 'hashmap', 1, (args, ctx) => int(BigInt(expectMap(arg(args, 0), 'the input of `length`', ctx).table.size)));

  interp.defineMethod('is-empty', 'hashmap', 1, (args, ctx) => bool(expectMap(arg(args, 0), 'the input of `is-empty`', ctx).table.size === 0));

  interp.defineMethod('merge', 'hashmap', 2, (args, ctx) => {
    const map = expectMap(arg(args, 0), 'the input of `merge`', ctx);
    const other = expectMap(arg(args, 1), 'the argument of `merge`', ctx);
    const result = mapOf(map.table.clone());
    for (const [key, value] of other.table.entries()) result.table.set(key, value);
    return result;
  });

  interp.defineMethod('each', 'hashmap', 2, (args, ctx) => {
    const map = expectMap(arg(args, 0), 'the input of `each`', ctx);
    const fn = expectProc(arg(args, 1), 'the body of `each`', ctx);
    for (const [key, value] of map.table.entries()) {
      if (!runLoopBody(() => callLambda(fn, [key, value], ctx))) break;
    }
    return NOTHING;
  });

  interp.defineMethod('map-values', 'hashmap', 2, (args, ctx) => {
    const map = expectMap(arg(args, 0), 'the input of `map-values`', ctx);
    const fn = expectProc(arg(args, 1), 'the body of `map-values`', ctx);
    const result = newMap();
    for (const [key, value] of map.table.entries()) result.table.set(key, callLambda(fn, [value], ctx));
    return result;
  });

  interp.defineMethod('keep', 'hashmap', 2, (args, ctx) => {
    const map = expectMap(arg(args, 0), 'the input of `keep`', ctx);
    const fn = expectProc(arg(args, 1), 'the body of `keep`', ctx);
    const result = newMap();
    for (const [key, value] of map.table.entries()) {
      if (expectCondition(callLambda(fn, [key, value], ctx), 'keep', ctx)) result.table.set(key, value);
    }
    return result;
  });

  interp.defineMethod('copy', 'hashmap', 1, (args, ctx) => mapOf(expectMap(arg(args, 0), 'the input of `copy`', ctx).table.clone()));
}
