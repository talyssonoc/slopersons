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
  interpreter.defineMethod('to-set', ['array', 'set'], 1, (inputs, context) => {
    const given = input(inputs, 0);
    if (given.type === 'set') return setOf(given.table.clone());
    if (given.type === 'array') return setFromItems(given.items);
    throw runtimeError(`the given of \`to-set\` must be an array or a set, got ${describeType(given)}`, context.position);
  });

  interpreter.defineMethod('add', 'set', 2, (inputs, context) => {
    const set = expectSet(input(inputs, 0), 'the input of `add`', context);
    set.table.set(input(inputs, 1), true);
    return set;
  });

  interpreter.defineMethod('remove', 'set', 2, (inputs, context) => {
    const set = expectSet(input(inputs, 0), 'the input of `remove`', context);
    set.table.delete(input(inputs, 1));
    return set;
  });

  interpreter.defineMethod('has', 'set', 2, (inputs, context) => boolean(expectSet(input(inputs, 0), 'the input of `has`', context).table.has(input(inputs, 1))));

  interpreter.defineMethod('contains', 'set', 2, (inputs, context) => boolean(expectSet(input(inputs, 0), 'the input of `contains`', context).table.has(input(inputs, 1))));

  interpreter.defineMethod('length', 'set', 1, (inputs, context) => int(BigInt(expectSet(input(inputs, 0), 'the input of `length`', context).table.size)));

  interpreter.defineMethod('is-empty', 'set', 1, (inputs, context) => boolean(expectSet(input(inputs, 0), 'the input of `is-empty`', context).table.size === 0));

  interpreter.defineMethod('union', 'set', 2, (inputs, context) => {
    const set = expectSet(input(inputs, 0), 'the input of `union`', context);
    const other = expectSet(input(inputs, 1), 'the argument of `union`', context);
    const result = setOf(set.table.clone());
    for (const item of other.table.keys()) result.table.set(item, true);
    return result;
  });

  interpreter.defineMethod('intersect', 'set', 2, (inputs, context) => {
    const set = expectSet(input(inputs, 0), 'the input of `intersect`', context);
    const other = expectSet(input(inputs, 1), 'the argument of `intersect`', context);
    return setFromItems(set.table.keys().filter((item) => other.table.has(item)));
  });

  interpreter.defineMethod('difference', 'set', 2, (inputs, context) => {
    const set = expectSet(input(inputs, 0), 'the input of `difference`', context);
    const other = expectSet(input(inputs, 1), 'the argument of `difference`', context);
    return setFromItems(set.table.keys().filter((item) => !other.table.has(item)));
  });

  interpreter.defineMethod('to-array', 'set', 1, (inputs, context) => array(expectSet(input(inputs, 0), 'the input of `to-array`', context).table.keys()));

  interpreter.defineMethod('each', 'set', 2, (inputs, context) => {
    const set = expectSet(input(inputs, 0), 'the input of `each`', context);
    const procedure = expectProc(input(inputs, 1), 'the body of `each`', context);
    for (const item of set.table.keys()) {
      if (!runLoopBody(() => callLambda(procedure, [item], context))) break;
    }
    return NOTHING;
  });

  interpreter.defineMethod('copy', 'set', 1, (inputs, context) => setOf(expectSet(input(inputs, 0), 'the input of `copy`', context).table.clone()));
}
