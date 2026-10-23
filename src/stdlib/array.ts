import { runtimeError } from '../errors.ts';
import { arithmetic, type CallContext, type Interpreter } from '../interpreter.ts';
import { stableSort } from '../runtime/sorting.ts';
import { NOTHING, array, bool, compareValues, describeType, int, newSet, str, valuesEqual, type Value } from '../values.ts';
import { arg, callLambda, expectArray, expectDecision, expectInt, expectProc, expectString, toIndex } from './core.ts';

function items(args: Value[], name: string, ctx: CallContext): Value[] {
  return expectArray(arg(args, 0), `the input of \`${name}\``, ctx);
}

function body(args: Value[], index: number, name: string, ctx: CallContext): Value {
  return expectProc(arg(args, index), `the body of \`${name}\``, ctx);
}

function matches(fn: Value, item: Value, name: string, ctx: CallContext): boolean {
  return expectDecision(callLambda(fn, [item], ctx), `the condition in \`${name}\``, ctx);
}

function indexInto(xs: Value[], value: Value, name: string, ctx: CallContext, allowEnd = false): number {
  const index = toIndex(value, `the index of \`${name}\``, ctx);
  const limit = allowEnd ? xs.length : xs.length - 1;
  if (index > limit) throw runtimeError(`index ${index} is out of range for an array of length ${xs.length}`, ctx.pos);
  return index;
}

function clampBound(value: Value, what: string, length: number, ctx: CallContext): number {
  const big = expectInt(value, what, ctx);
  if (big < 0n) return 0;
  if (big > BigInt(length)) return length;
  return Number(big);
}

function nonEmpty(xs: Value[], name: string, ctx: CallContext): void {
  if (xs.length === 0) throw runtimeError(`cannot take \`${name}\` of an empty array`, ctx.pos);
}

function extreme(xs: Value[], name: string, keepWhen: (comparison: number) => boolean, ctx: CallContext): Value {
  nonEmpty(xs, name, ctx);
  let best: Value | undefined;
  for (const item of xs) {
    if (best === undefined || keepWhen(compareValues(item, best, ctx.pos))) best = item;
  }
  return best ?? NOTHING;
}

export function registerArray(interp: Interpreter): void {
  interp.defineMethod('length', 'array', 1, (args, ctx) => int(BigInt(items(args, 'length', ctx).length)));

  interp.defineMethod('is-empty', 'array', 1, (args, ctx) => bool(items(args, 'is-empty', ctx).length === 0));

  interp.defineMethod('at', 'array', 2, (args, ctx) => {
    const xs = items(args, 'at', ctx);
    return xs[indexInto(xs, arg(args, 1), 'at', ctx)] ?? NOTHING;
  });

  interp.defineMethod('put', 'array', 3, (args, ctx) => {
    const xs = items(args, 'put', ctx);
    xs[indexInto(xs, arg(args, 1), 'put', ctx)] = arg(args, 2);
    return arg(args, 0);
  });

  interp.defineMethod('push', 'array', 2, (args, ctx) => {
    items(args, 'push', ctx).push(arg(args, 1));
    return arg(args, 0);
  });

  interp.defineMethod('pop', 'array', 1, (args, ctx) => {
    const xs = items(args, 'pop', ctx);
    if (xs.length === 0) throw runtimeError('cannot pop from an empty array', ctx.pos);
    return xs.pop() ?? NOTHING;
  });

  interp.defineMethod('insert', 'array', 3, (args, ctx) => {
    const xs = items(args, 'insert', ctx);
    xs.splice(indexInto(xs, arg(args, 1), 'insert', ctx, true), 0, arg(args, 2));
    return arg(args, 0);
  });

  interp.defineMethod('remove-at', 'array', 2, (args, ctx) => {
    const xs = items(args, 'remove-at', ctx);
    xs.splice(indexInto(xs, arg(args, 1), 'remove-at', ctx), 1);
    return arg(args, 0);
  });

  interp.defineMethod('first', 'array', 1, (args, ctx) => {
    const xs = items(args, 'first', ctx);
    nonEmpty(xs, 'first', ctx);
    return xs[0] ?? NOTHING;
  });

  interp.defineMethod('last', 'array', 1, (args, ctx) => {
    const xs = items(args, 'last', ctx);
    nonEmpty(xs, 'last', ctx);
    return xs[xs.length - 1] ?? NOTHING;
  });

  interp.defineMethod('slice', 'array', 3, (args, ctx) => {
    const xs = items(args, 'slice', ctx);
    const start = clampBound(arg(args, 1), 'the start of `slice`', xs.length, ctx);
    const end = clampBound(arg(args, 2), 'the end of `slice`', xs.length, ctx);
    return array(end <= start ? [] : xs.slice(start, end));
  });

  interp.defineMethod('concat', 'array', 2, (args, ctx) => {
    const xs = items(args, 'concat', ctx);
    const other = expectArray(arg(args, 1), 'the argument of `concat`', ctx);
    return array([...xs, ...other]);
  });

  interp.defineMethod('flatten', 'array', 1, (args, ctx) => {
    const out: Value[] = [];
    for (const item of items(args, 'flatten', ctx)) {
      if (item.t === 'array') {
        for (const inner of item.items) out.push(inner);
      } else {
        out.push(item);
      }
    }
    return array(out);
  });

  interp.defineMethod('zip', 'array', 2, (args, ctx) => {
    const xs = items(args, 'zip', ctx);
    const other = expectArray(arg(args, 1), 'the argument of `zip`', ctx);
    const out: Value[] = [];
    const n = Math.min(xs.length, other.length);
    for (let i = 0; i < n; i++) {
      const left = xs[i];
      const right = other[i];
      if (left !== undefined && right !== undefined) out.push(array([left, right]));
    }
    return array(out);
  });

  interp.defineMethod('contains', 'array', 2, (args, ctx) => {
    const target = arg(args, 1);
    return bool(items(args, 'contains', ctx).some((item) => valuesEqual(item, target)));
  });

  interp.defineMethod('index-of', 'array', 2, (args, ctx) => {
    const xs = items(args, 'index-of', ctx);
    const target = arg(args, 1);
    for (let i = 0; i < xs.length; i++) {
      const item = xs[i];
      if (item !== undefined && valuesEqual(item, target)) return int(BigInt(i));
    }
    return NOTHING;
  });

  interp.defineMethod('sum', 'array', 1, (args, ctx) => {
    let total: Value = int(0n);
    for (const item of items(args, 'sum', ctx)) {
      if (item.t !== 'int' && item.t !== 'float') {
        throw runtimeError(`\`sum\` needs an array of numbers, but found ${describeType(item)}`, ctx.pos);
      }
      total = arithmetic('+', total, item, ctx.pos);
    }
    return total;
  });

  interp.defineMethod('min', 'array', 1, (args, ctx) => extreme(items(args, 'min', ctx), 'min', (c) => c < 0, ctx));

  interp.defineMethod('max', 'array', 1, (args, ctx) => extreme(items(args, 'max', ctx), 'max', (c) => c > 0, ctx));

  interp.defineMethod('unique', 'array', 1, (args, ctx) => {
    const seen = newSet();
    const out: Value[] = [];
    for (const item of items(args, 'unique', ctx)) {
      if (seen.table.has(item)) continue;
      seen.table.set(item, true);
      out.push(item);
    }
    return array(out);
  });

  interp.defineMethod('reverse', 'array', 1, (args, ctx) => {
    const xs = items(args, 'reverse', ctx);
    const out: Value[] = [];
    for (let i = xs.length - 1; i >= 0; i--) {
      const item = xs[i];
      if (item !== undefined) out.push(item);
    }
    return array(out);
  });

  interp.defineMethod('join', 'array', 2, (args, ctx) => {
    const xs = items(args, 'join', ctx);
    const separator = expectString(arg(args, 1), 'the separator of `join`', ctx);
    let out = '';
    for (let i = 0; i < xs.length; i++) {
      const item = xs[i];
      if (item === undefined) continue;
      if (item.t !== 'string') throw runtimeError(`\`join\` needs an array of strings, but found ${describeType(item)}`, ctx.pos);
      if (i > 0) out += separator;
      out += item.v;
    }
    return str(out);
  });

  interp.defineMethod('sort', 'array', 1, (args, ctx) => array(stableSort(items(args, 'sort', ctx), (a, b) => compareValues(a, b, ctx.pos))));

  interp.defineMethod('sort-by', 'array', 2, (args, ctx) => {
    const xs = items(args, 'sort-by', ctx);
    const fn = body(args, 1, 'sort-by', ctx);
    const before = (a: Value, b: Value): boolean => expectDecision(callLambda(fn, [a, b], ctx), 'the comparison in `sort-by`', ctx);
    return array(stableSort(xs, (a, b) => (before(a, b) ? -1 : before(b, a) ? 1 : 0)));
  });

  interp.defineMethod('map', 'array', 2, (args, ctx) => {
    const xs = items(args, 'map', ctx);
    const fn = body(args, 1, 'map', ctx);
    return array(xs.slice().map((item) => callLambda(fn, [item], ctx)));
  });

  interp.defineMethod('keep', 'array', 2, (args, ctx) => {
    const xs = items(args, 'keep', ctx);
    const fn = body(args, 1, 'keep', ctx);
    return array(xs.slice().filter((item) => matches(fn, item, 'keep', ctx)));
  });

  interp.defineMethod('reject', 'array', 2, (args, ctx) => {
    const xs = items(args, 'reject', ctx);
    const fn = body(args, 1, 'reject', ctx);
    return array(xs.slice().filter((item) => !matches(fn, item, 'reject', ctx)));
  });

  interp.defineMethod('reduce', 'array', 3, (args, ctx) => {
    const xs = items(args, 'reduce', ctx);
    const fn = body(args, 2, 'reduce', ctx);
    let acc = arg(args, 1);
    for (const item of xs.slice()) acc = callLambda(fn, [acc, item], ctx);
    return acc;
  });

  interp.defineMethod('any', 'array', 2, (args, ctx) => {
    const xs = items(args, 'any', ctx);
    const fn = body(args, 1, 'any', ctx);
    for (const item of xs.slice()) {
      if (matches(fn, item, 'any', ctx)) return bool(true);
    }
    return bool(false);
  });

  interp.defineMethod('all', 'array', 2, (args, ctx) => {
    const xs = items(args, 'all', ctx);
    const fn = body(args, 1, 'all', ctx);
    for (const item of xs.slice()) {
      if (!matches(fn, item, 'all', ctx)) return bool(false);
    }
    return bool(true);
  });

  interp.defineMethod('find', 'array', 2, (args, ctx) => {
    const xs = items(args, 'find', ctx);
    const fn = body(args, 1, 'find', ctx);
    for (const item of xs.slice()) {
      if (matches(fn, item, 'find', ctx)) return item;
    }
    return NOTHING;
  });

  interp.defineMethod('count', 'array', 2, (args, ctx) => {
    const xs = items(args, 'count', ctx);
    const fn = body(args, 1, 'count', ctx);
    let total = 0n;
    for (const item of xs.slice()) {
      if (matches(fn, item, 'count', ctx)) total++;
    }
    return int(total);
  });

  interp.defineMethod('with-index', 'array', 1, (args, ctx) => array(items(args, 'with-index', ctx).map((item, i) => array([int(BigInt(i)), item]))));

  interp.defineMethod('copy', 'array', 1, (args, ctx) => array(items(args, 'copy', ctx).slice()));
}
