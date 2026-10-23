import { runtimeError } from '../errors.ts';
import type { CallContext, Interpreter } from '../interpreter.ts';
import type { HashTable } from '../runtime/hashtable.ts';
import { NOTHING, array, bool, describeType, int, newSet, type SetValue, type Value } from '../values.ts';
import { arg, callLambda, expectProc, runLoopBody } from './core.ts';

function expectSet(value: Value, what: string, ctx: CallContext): SetValue {
  if (value.t !== 'set') throw runtimeError(`${what} must be a set, got ${describeType(value)}`, ctx.pos);
  return value;
}

function setOf(table: HashTable<Value, true>): SetValue {
  return { t: 'set', table };
}

function setFromItems(items: Value[]): SetValue {
  const set = newSet();
  for (const item of items) set.table.set(item, true);
  return set;
}

export function registerSet(interp: Interpreter): void {
  interp.defineMethod('to-set', ['array', 'set'], 1, (args, ctx) => {
    const input = arg(args, 0);
    if (input.t === 'set') return setOf(input.table.clone());
    if (input.t === 'array') return setFromItems(input.items);
    throw runtimeError(`the input of \`to-set\` must be an array or a set, got ${describeType(input)}`, ctx.pos);
  });

  interp.defineMethod('add', 'set', 2, (args, ctx) => {
    const set = expectSet(arg(args, 0), 'the input of `add`', ctx);
    set.table.set(arg(args, 1), true);
    return set;
  });

  interp.defineMethod('remove', 'set', 2, (args, ctx) => {
    const set = expectSet(arg(args, 0), 'the input of `remove`', ctx);
    set.table.delete(arg(args, 1));
    return set;
  });

  interp.defineMethod('has', 'set', 2, (args, ctx) => bool(expectSet(arg(args, 0), 'the input of `has`', ctx).table.has(arg(args, 1))));

  interp.defineMethod('contains', 'set', 2, (args, ctx) => bool(expectSet(arg(args, 0), 'the input of `contains`', ctx).table.has(arg(args, 1))));

  interp.defineMethod('length', 'set', 1, (args, ctx) => int(BigInt(expectSet(arg(args, 0), 'the input of `length`', ctx).table.size)));

  interp.defineMethod('is-empty', 'set', 1, (args, ctx) => bool(expectSet(arg(args, 0), 'the input of `is-empty`', ctx).table.size === 0));

  interp.defineMethod('union', 'set', 2, (args, ctx) => {
    const set = expectSet(arg(args, 0), 'the input of `union`', ctx);
    const other = expectSet(arg(args, 1), 'the argument of `union`', ctx);
    const result = setOf(set.table.clone());
    for (const item of other.table.keys()) result.table.set(item, true);
    return result;
  });

  interp.defineMethod('intersect', 'set', 2, (args, ctx) => {
    const set = expectSet(arg(args, 0), 'the input of `intersect`', ctx);
    const other = expectSet(arg(args, 1), 'the argument of `intersect`', ctx);
    return setFromItems(set.table.keys().filter((item) => other.table.has(item)));
  });

  interp.defineMethod('difference', 'set', 2, (args, ctx) => {
    const set = expectSet(arg(args, 0), 'the input of `difference`', ctx);
    const other = expectSet(arg(args, 1), 'the argument of `difference`', ctx);
    return setFromItems(set.table.keys().filter((item) => !other.table.has(item)));
  });

  interp.defineMethod('to-array', 'set', 1, (args, ctx) => array(expectSet(arg(args, 0), 'the input of `to-array`', ctx).table.keys()));

  interp.defineMethod('each', 'set', 2, (args, ctx) => {
    const set = expectSet(arg(args, 0), 'the input of `each`', ctx);
    const fn = expectProc(arg(args, 1), 'the body of `each`', ctx);
    for (const item of set.table.keys()) {
      if (!runLoopBody(() => callLambda(fn, [item], ctx))) break;
    }
    return NOTHING;
  });

  interp.defineMethod('copy', 'set', 1, (args, ctx) => setOf(expectSet(arg(args, 0), 'the input of `copy`', ctx).table.clone()));
}
