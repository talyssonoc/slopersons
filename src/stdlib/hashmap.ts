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
  return expectDecision(value, `the condition in \`hashmap/${name}\``, context);
}

function mapOf(table: HashTable<Value, Value>): MapValue {
  return { type: 'map', table };
}

function entryPairs(map: MapValue): Value {
  return array(map.table.entries().map(([key, value]) => array([key, value])));
}

export function registerHashmap(interpreter: Interpreter): void {
  interpreter.defineIn('hashmap', 'at', 2, (inputs, context) => {
    const map = expectMap(input(inputs, 0), 'the input of `hashmap/at`', context);
    const key = input(inputs, 1);
    const found = map.table.get(key);
    if (found === undefined) throw runtimeError(`key ${formatValue(key, 'show')} not found in hashmap`, context.position);
    return found;
  });

  interpreter.defineIn('hashmap', 'at-or', 3, (inputs, context) => {
    const map = expectMap(input(inputs, 0), 'the input of `hashmap/at-or`', context);
    return map.table.get(input(inputs, 1)) ?? input(inputs, 2);
  });

  interpreter.defineIn('hashmap', 'put', 3, (inputs, context) => {
    const map = expectMap(input(inputs, 0), 'the input of `hashmap/put`', context);
    map.table.set(input(inputs, 1), input(inputs, 2));
    return map;
  });

  interpreter.defineIn('hashmap', 'remove', 2, (inputs, context) => {
    const map = expectMap(input(inputs, 0), 'the input of `hashmap/remove`', context);
    map.table.delete(input(inputs, 1));
    return map;
  });

  interpreter.defineIn('hashmap', 'has', 2, (inputs, context) => {
    const map = expectMap(input(inputs, 0), 'the input of `hashmap/has`', context);
    return boolean(map.table.has(input(inputs, 1)));
  });

  interpreter.defineIn('hashmap', 'keys', 1, (inputs, context) => array(expectMap(input(inputs, 0), 'the input of `hashmap/keys`', context).table.keys()));

  interpreter.defineIn('hashmap', 'values', 1, (inputs, context) => array(expectMap(input(inputs, 0), 'the input of `hashmap/values`', context).table.values()));

  interpreter.defineIn('hashmap', 'entries', 1, (inputs, context) => entryPairs(expectMap(input(inputs, 0), 'the input of `hashmap/entries`', context)));

  interpreter.defineIn('hashmap', 'length', 1, (inputs, context) => int(BigInt(expectMap(input(inputs, 0), 'the input of `hashmap/length`', context).table.size)));

  interpreter.defineIn('hashmap', 'is-empty', 1, (inputs, context) => boolean(expectMap(input(inputs, 0), 'the input of `hashmap/is-empty`', context).table.size === 0));

  interpreter.defineIn('hashmap', 'merge', 2, (inputs, context) => {
    const map = expectMap(input(inputs, 0), 'the input of `hashmap/merge`', context);
    const other = expectMap(input(inputs, 1), 'the argument of `hashmap/merge`', context);
    const result = mapOf(map.table.clone());
    for (const [key, value] of other.table.entries()) result.table.set(key, value);
    return result;
  });

  interpreter.defineIn('hashmap', 'each', 2, (inputs, context) => {
    const map = expectMap(input(inputs, 0), 'the input of `hashmap/each`', context);
    const procedure = expectProc(input(inputs, 1), 'the body of `hashmap/each`', context);
    for (const [key, value] of map.table.entries()) {
      if (!runLoopBody(() => callLambda(procedure, [key, value], context))) break;
    }
    return NOTHING;
  });

  interpreter.defineIn('hashmap', 'map-values', 2, (inputs, context) => {
    const map = expectMap(input(inputs, 0), 'the input of `hashmap/map-values`', context);
    const procedure = expectProc(input(inputs, 1), 'the body of `hashmap/map-values`', context);
    const result = newMap();
    for (const [key, value] of map.table.entries()) result.table.set(key, callLambda(procedure, [value], context));
    return result;
  });

  interpreter.defineIn('hashmap', 'keep', 2, (inputs, context) => {
    const map = expectMap(input(inputs, 0), 'the input of `hashmap/keep`', context);
    const procedure = expectProc(input(inputs, 1), 'the body of `hashmap/keep`', context);
    const result = newMap();
    for (const [key, value] of map.table.entries()) {
      if (expectCondition(callLambda(procedure, [key, value], context), 'keep', context)) result.table.set(key, value);
    }
    return result;
  });

  interpreter.defineIn('hashmap', 'copy', 1, (inputs, context) => mapOf(expectMap(input(inputs, 0), 'the input of `hashmap/copy`', context).table.clone()));
}
