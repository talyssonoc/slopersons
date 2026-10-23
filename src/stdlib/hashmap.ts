import { runtimeError } from '../errors.ts';
import type { CallContext, Interpreter } from '../interpreter.ts';
import type { HashTable } from '../runtime/hashtable.ts';
import { NOTHING, array, boolean, describeType, formatValue, int, newMap, type MapValue, type Value } from '../values.ts';
import { input, callLambda, expectDecision, expectProc, runLoopBody } from './core.ts';

function expectMap(value: Value, what: string, context: CallContext): MapValue {
  if (value.type !== 'map') throw runtimeError(`${what} must be a hashmap, got ${describeType(value)}`, context.position);
  return value;
}

function expectCondition(value: Value, name: string, context: CallContext): boolean {
  return expectDecision(value, `the condition in \`${name}\``, context);
}

function mapOf(table: HashTable<Value, Value>): MapValue {
  return { type: 'map', table };
}

function entryPairs(map: MapValue): Value {
  return array(map.table.entries().map(([key, value]) => array([key, value])));
}

export function registerHashmap(interpreter: Interpreter): void {
  interpreter.defineMethod('at', 'hashmap', 2, (inputs, context) => {
    const map = expectMap(input(inputs, 0), 'the input of `at`', context);
    const key = input(inputs, 1);
    const found = map.table.get(key);
    if (found === undefined) throw runtimeError(`key ${formatValue(key, 'show')} not found in hashmap`, context.position);
    return found;
  });

  interpreter.defineMethod('at-or', 'hashmap', 3, (inputs, context) => {
    const map = expectMap(input(inputs, 0), 'the input of `at-or`', context);
    return map.table.get(input(inputs, 1)) ?? input(inputs, 2);
  });

  interpreter.defineMethod('put', 'hashmap', 3, (inputs, context) => {
    const map = expectMap(input(inputs, 0), 'the input of `put`', context);
    map.table.set(input(inputs, 1), input(inputs, 2));
    return map;
  });

  interpreter.defineMethod('remove', 'hashmap', 2, (inputs, context) => {
    const map = expectMap(input(inputs, 0), 'the input of `remove`', context);
    map.table.delete(input(inputs, 1));
    return map;
  });

  interpreter.defineMethod('has', 'hashmap', 2, (inputs, context) => {
    const map = expectMap(input(inputs, 0), 'the input of `has`', context);
    return boolean(map.table.has(input(inputs, 1)));
  });

  interpreter.defineMethod('keys', 'hashmap', 1, (inputs, context) => array(expectMap(input(inputs, 0), 'the input of `keys`', context).table.keys()));

  interpreter.defineMethod('values', 'hashmap', 1, (inputs, context) => array(expectMap(input(inputs, 0), 'the input of `values`', context).table.values()));

  interpreter.defineMethod('entries', 'hashmap', 1, (inputs, context) => entryPairs(expectMap(input(inputs, 0), 'the input of `entries`', context)));

  interpreter.defineMethod('to-array', 'hashmap', 1, (inputs, context) => entryPairs(expectMap(input(inputs, 0), 'the input of `to-array`', context)));

  interpreter.defineMethod('length', 'hashmap', 1, (inputs, context) => int(BigInt(expectMap(input(inputs, 0), 'the input of `length`', context).table.size)));

  interpreter.defineMethod('is-empty', 'hashmap', 1, (inputs, context) => boolean(expectMap(input(inputs, 0), 'the input of `is-empty`', context).table.size === 0));

  interpreter.defineMethod('merge', 'hashmap', 2, (inputs, context) => {
    const map = expectMap(input(inputs, 0), 'the input of `merge`', context);
    const other = expectMap(input(inputs, 1), 'the argument of `merge`', context);
    const result = mapOf(map.table.clone());
    for (const [key, value] of other.table.entries()) result.table.set(key, value);
    return result;
  });

  interpreter.defineMethod('each', 'hashmap', 2, (inputs, context) => {
    const map = expectMap(input(inputs, 0), 'the input of `each`', context);
    const procedure = expectProc(input(inputs, 1), 'the body of `each`', context);
    for (const [key, value] of map.table.entries()) {
      if (!runLoopBody(() => callLambda(procedure, [key, value], context))) break;
    }
    return NOTHING;
  });

  interpreter.defineMethod('map-values', 'hashmap', 2, (inputs, context) => {
    const map = expectMap(input(inputs, 0), 'the input of `map-values`', context);
    const procedure = expectProc(input(inputs, 1), 'the body of `map-values`', context);
    const result = newMap();
    for (const [key, value] of map.table.entries()) result.table.set(key, callLambda(procedure, [value], context));
    return result;
  });

  interpreter.defineMethod('keep', 'hashmap', 2, (inputs, context) => {
    const map = expectMap(input(inputs, 0), 'the input of `keep`', context);
    const procedure = expectProc(input(inputs, 1), 'the body of `keep`', context);
    const result = newMap();
    for (const [key, value] of map.table.entries()) {
      if (expectCondition(callLambda(procedure, [key, value], context), 'keep', context)) result.table.set(key, value);
    }
    return result;
  });

  interpreter.defineMethod('copy', 'hashmap', 1, (inputs, context) => mapOf(expectMap(input(inputs, 0), 'the input of `copy`', context).table.clone()));
}
