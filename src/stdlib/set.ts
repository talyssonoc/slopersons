import { runtimeError } from '../errors.ts';
import type { CallContext, Interpreter } from '../interpreter.ts';
import type { HashTable } from '../runtime/hashtable.ts';
import { NOTHING, array, boolean, describeType, int, newSet, type SetValue, type Value } from '../values.ts';
import { input, callLambda, expectProc, runLoopBody } from './core.ts';

function expectSet(value: Value, what: string, context: CallContext): SetValue {
  if (value.type !== 'set') throw runtimeError(`${what} must be a set, got ${describeType(value)}`, context.position);
  return value;
}

function setOf(table: HashTable<Value, true>): SetValue {
  return { type: 'set', table };
}

function setFromItems(items: Value[]): SetValue {
  const set = newSet();
  for (const item of items) set.table.set(item, true);
  return set;
}

export function registerSet(interpreter: Interpreter): void {
  interpreter.defineIn('array', 'to-set', 1, (inputs, context) => {
    const given = input(inputs, 0);
    if (given.type === 'array') return setFromItems(given.items);
    throw runtimeError(`the input of \`array/to-set\` must be an array, got ${describeType(given)}`, context.position);
  });

  interpreter.defineIn('set', 'add', 2, (inputs, context) => {
    const set = expectSet(input(inputs, 0), 'the input of `set/add`', context);
    set.table.set(input(inputs, 1), true);
    return set;
  });

  interpreter.defineIn('set', 'remove', 2, (inputs, context) => {
    const set = expectSet(input(inputs, 0), 'the input of `set/remove`', context);
    set.table.delete(input(inputs, 1));
    return set;
  });

  interpreter.defineIn('set', 'has', 2, (inputs, context) => boolean(expectSet(input(inputs, 0), 'the input of `set/has`', context).table.has(input(inputs, 1))));

  interpreter.defineIn('set', 'length', 1, (inputs, context) => int(BigInt(expectSet(input(inputs, 0), 'the input of `set/length`', context).table.size)));

  interpreter.defineIn('set', 'is-empty', 1, (inputs, context) => boolean(expectSet(input(inputs, 0), 'the input of `set/is-empty`', context).table.size === 0));

  interpreter.defineIn('set', 'union', 2, (inputs, context) => {
    const set = expectSet(input(inputs, 0), 'the input of `set/union`', context);
    const other = expectSet(input(inputs, 1), 'the argument of `set/union`', context);
    const result = setOf(set.table.clone());
    for (const item of other.table.keys()) result.table.set(item, true);
    return result;
  });

  interpreter.defineIn('set', 'intersect', 2, (inputs, context) => {
    const set = expectSet(input(inputs, 0), 'the input of `set/intersect`', context);
    const other = expectSet(input(inputs, 1), 'the argument of `set/intersect`', context);
    return setFromItems(set.table.keys().filter((item) => other.table.has(item)));
  });

  interpreter.defineIn('set', 'difference', 2, (inputs, context) => {
    const set = expectSet(input(inputs, 0), 'the input of `set/difference`', context);
    const other = expectSet(input(inputs, 1), 'the argument of `set/difference`', context);
    return setFromItems(set.table.keys().filter((item) => !other.table.has(item)));
  });

  interpreter.defineIn('set', 'to-array', 1, (inputs, context) => array(expectSet(input(inputs, 0), 'the input of `set/to-array`', context).table.keys()));

  interpreter.defineIn('set', 'each', 2, (inputs, context) => {
    const set = expectSet(input(inputs, 0), 'the input of `set/each`', context);
    const procedure = expectProc(input(inputs, 1), 'the body of `set/each`', context);
    for (const item of set.table.keys()) {
      if (!runLoopBody(() => callLambda(procedure, [item], context))) break;
    }
    return NOTHING;
  });

  interpreter.defineIn('set', 'copy', 1, (inputs, context) => setOf(expectSet(input(inputs, 0), 'the input of `set/copy`', context).table.clone()));
}
