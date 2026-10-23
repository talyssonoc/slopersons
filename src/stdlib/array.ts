import { runtimeError } from '../errors.ts';
import { arithmetic, type CallContext, type Interpreter } from '../interpreter.ts';
import { stableSort } from '../runtime/sorting.ts';
import { NOTHING, array, boolean, compareValues, describeType, int, newSet, string, valuesEqual, type Value } from '../values.ts';
import { input, callLambda, expectArray, expectDecision, expectInt, expectProc, expectString, toIndex } from './core.ts';

function items(inputs: Value[], name: string, context: CallContext): Value[] {
  return expectArray(input(inputs, 0), `the input of \`${name}\``, context);
}

function body(inputs: Value[], index: number, name: string, context: CallContext): Value {
  return expectProc(input(inputs, index), `the body of \`${name}\``, context);
}

function matches(procedure: Value, item: Value, name: string, context: CallContext): boolean {
  return expectDecision(callLambda(procedure, [item], context), `the condition in \`${name}\``, context);
}

function indexInto(items: Value[], value: Value, name: string, context: CallContext, allowEnd = false): number {
  const index = toIndex(value, `the index of \`${name}\``, context);
  const limit = allowEnd ? items.length : items.length - 1;
  if (index > limit) throw runtimeError(`index ${index} is out of range for an array of length ${items.length}`, context.position);
  return index;
}

function clampBound(value: Value, what: string, length: number, context: CallContext): number {
  const big = expectInt(value, what, context);
  if (big < 0n) return 0;
  if (big > BigInt(length)) return length;
  return Number(big);
}

function nonEmpty(items: Value[], name: string, context: CallContext): void {
  if (items.length === 0) throw runtimeError(`cannot take \`${name}\` of an empty array`, context.position);
}

function extreme(items: Value[], name: string, keepWhen: (comparison: number) => boolean, context: CallContext): Value {
  nonEmpty(items, name, context);
  let best: Value | undefined;
  for (const item of items) {
    if (best === undefined || keepWhen(compareValues(item, best, context.position))) best = item;
  }
  return best ?? NOTHING;
}

export function registerArray(interpreter: Interpreter): void {
  interpreter.defineMethod('length', 'array', 1, (inputs, context) => int(BigInt(items(inputs, 'length', context).length)));

  interpreter.defineMethod('is-empty', 'array', 1, (inputs, context) => boolean(items(inputs, 'is-empty', context).length === 0));

  interpreter.defineMethod('at', 'array', 2, (inputs, context) => {
    const elements = items(inputs, 'at', context);
    return elements[indexInto(elements, input(inputs, 1), 'at', context)] ?? NOTHING;
  });

  interpreter.defineMethod('put', 'array', 3, (inputs, context) => {
    const elements = items(inputs, 'put', context);
    elements[indexInto(elements, input(inputs, 1), 'put', context)] = input(inputs, 2);
    return input(inputs, 0);
  });

  interpreter.defineMethod('push', 'array', 2, (inputs, context) => {
    items(inputs, 'push', context).push(input(inputs, 1));
    return input(inputs, 0);
  });

  interpreter.defineMethod('pop', 'array', 1, (inputs, context) => {
    const elements = items(inputs, 'pop', context);
    if (elements.length === 0) throw runtimeError('cannot pop from an empty array', context.position);
    return elements.pop() ?? NOTHING;
  });

  interpreter.defineMethod('insert', 'array', 3, (inputs, context) => {
    const elements = items(inputs, 'insert', context);
    elements.splice(indexInto(elements, input(inputs, 1), 'insert', context, true), 0, input(inputs, 2));
    return input(inputs, 0);
  });

  interpreter.defineMethod('remove-at', 'array', 2, (inputs, context) => {
    const elements = items(inputs, 'remove-at', context);
    elements.splice(indexInto(elements, input(inputs, 1), 'remove-at', context), 1);
    return input(inputs, 0);
  });

  interpreter.defineMethod('first', 'array', 1, (inputs, context) => {
    const elements = items(inputs, 'first', context);
    nonEmpty(elements, 'first', context);
    return elements[0] ?? NOTHING;
  });

  interpreter.defineMethod('last', 'array', 1, (inputs, context) => {
    const elements = items(inputs, 'last', context);
    nonEmpty(elements, 'last', context);
    return elements[elements.length - 1] ?? NOTHING;
  });

  interpreter.defineMethod('slice', 'array', 3, (inputs, context) => {
    const elements = items(inputs, 'slice', context);
    const start = clampBound(input(inputs, 1), 'the start of `slice`', elements.length, context);
    const end = clampBound(input(inputs, 2), 'the end of `slice`', elements.length, context);
    return array(end <= start ? [] : elements.slice(start, end));
  });

  interpreter.defineMethod('concat', 'array', 2, (inputs, context) => {
    const elements = items(inputs, 'concat', context);
    const other = expectArray(input(inputs, 1), 'the argument of `concat`', context);
    return array([...elements, ...other]);
  });

  interpreter.defineMethod('flatten', 'array', 1, (inputs, context) => {
    const out: Value[] = [];
    for (const item of items(inputs, 'flatten', context)) {
      if (item.type === 'array') {
        for (const inner of item.items) out.push(inner);
      } else {
        out.push(item);
      }
    }
    return array(out);
  });

  interpreter.defineMethod('zip', 'array', 2, (inputs, context) => {
    const elements = items(inputs, 'zip', context);
    const other = expectArray(input(inputs, 1), 'the argument of `zip`', context);
    const out: Value[] = [];
    const count = Math.min(elements.length, other.length);
    for (let i = 0; i < count; i++) {
      const left = elements[i];
      const right = other[i];
      if (left !== undefined && right !== undefined) out.push(array([left, right]));
    }
    return array(out);
  });

  interpreter.defineMethod('contains', 'array', 2, (inputs, context) => {
    const target = input(inputs, 1);
    return boolean(items(inputs, 'contains', context).some((item) => valuesEqual(item, target)));
  });

  interpreter.defineMethod('index-of', 'array', 2, (inputs, context) => {
    const elements = items(inputs, 'index-of', context);
    const target = input(inputs, 1);
    for (let i = 0; i < elements.length; i++) {
      const item = elements[i];
      if (item !== undefined && valuesEqual(item, target)) return int(BigInt(i));
    }
    return NOTHING;
  });

  interpreter.defineMethod('sum', 'array', 1, (inputs, context) => {
    let total: Value = int(0n);
    for (const item of items(inputs, 'sum', context)) {
      if (item.type !== 'int' && item.type !== 'float') {
        throw runtimeError(`\`sum\` needs an array of numbers, but found ${describeType(item)}`, context.position);
      }
      total = arithmetic('+', total, item, context.position);
    }
    return total;
  });

  interpreter.defineMethod('min', 'array', 1, (inputs, context) => extreme(items(inputs, 'min', context), 'min', (cursor) => cursor < 0, context));

  interpreter.defineMethod('max', 'array', 1, (inputs, context) => extreme(items(inputs, 'max', context), 'max', (cursor) => cursor > 0, context));

  interpreter.defineMethod('unique', 'array', 1, (inputs, context) => {
    const seen = newSet();
    const out: Value[] = [];
    for (const item of items(inputs, 'unique', context)) {
      if (seen.table.has(item)) continue;
      seen.table.set(item, true);
      out.push(item);
    }
    return array(out);
  });

  interpreter.defineMethod('reverse', 'array', 1, (inputs, context) => {
    const elements = items(inputs, 'reverse', context);
    const out: Value[] = [];
    for (let i = elements.length - 1; i >= 0; i--) {
      const item = elements[i];
      if (item !== undefined) out.push(item);
    }
    return array(out);
  });

  interpreter.defineMethod('join', 'array', 2, (inputs, context) => {
    const elements = items(inputs, 'join', context);
    const separator = expectString(input(inputs, 1), 'the separator of `join`', context);
    let out = '';
    for (let i = 0; i < elements.length; i++) {
      const item = elements[i];
      if (item === undefined) continue;
      if (item.type !== 'string') throw runtimeError(`\`join\` needs an array of strings, but found ${describeType(item)}`, context.position);
      if (i > 0) out += separator;
      out += item.value;
    }
    return string(out);
  });

  interpreter.defineMethod('sort', 'array', 1, (inputs, context) => array(stableSort(items(inputs, 'sort', context), (left, right) => compareValues(left, right, context.position))));

  interpreter.defineMethod('sort-by', 'array', 2, (inputs, context) => {
    const elements = items(inputs, 'sort-by', context);
    const procedure = body(inputs, 1, 'sort-by', context);
    const before = (left: Value, right: Value): boolean => expectDecision(callLambda(procedure, [left, right], context), 'the comparison in `sort-by`', context);
    return array(stableSort(elements, (left, right) => (before(left, right) ? -1 : before(right, left) ? 1 : 0)));
  });

  interpreter.defineMethod('map', 'array', 2, (inputs, context) => {
    const elements = items(inputs, 'map', context);
    const procedure = body(inputs, 1, 'map', context);
    return array(elements.slice().map((item) => callLambda(procedure, [item], context)));
  });

  interpreter.defineMethod('keep', 'array', 2, (inputs, context) => {
    const elements = items(inputs, 'keep', context);
    const procedure = body(inputs, 1, 'keep', context);
    return array(elements.slice().filter((item) => matches(procedure, item, 'keep', context)));
  });

  interpreter.defineMethod('reject', 'array', 2, (inputs, context) => {
    const elements = items(inputs, 'reject', context);
    const procedure = body(inputs, 1, 'reject', context);
    return array(elements.slice().filter((item) => !matches(procedure, item, 'reject', context)));
  });

  interpreter.defineMethod('reduce', 'array', 3, (inputs, context) => {
    const elements = items(inputs, 'reduce', context);
    const procedure = body(inputs, 2, 'reduce', context);
    let accumulator = input(inputs, 1);
    for (const item of elements.slice()) accumulator = callLambda(procedure, [accumulator, item], context);
    return accumulator;
  });

  interpreter.defineMethod('any', 'array', 2, (inputs, context) => {
    const elements = items(inputs, 'any', context);
    const procedure = body(inputs, 1, 'any', context);
    for (const item of elements.slice()) {
      if (matches(procedure, item, 'any', context)) return boolean(true);
    }
    return boolean(false);
  });

  interpreter.defineMethod('all', 'array', 2, (inputs, context) => {
    const elements = items(inputs, 'all', context);
    const procedure = body(inputs, 1, 'all', context);
    for (const item of elements.slice()) {
      if (!matches(procedure, item, 'all', context)) return boolean(false);
    }
    return boolean(true);
  });

  interpreter.defineMethod('find', 'array', 2, (inputs, context) => {
    const elements = items(inputs, 'find', context);
    const procedure = body(inputs, 1, 'find', context);
    for (const item of elements.slice()) {
      if (matches(procedure, item, 'find', context)) return item;
    }
    return NOTHING;
  });

  interpreter.defineMethod('count', 'array', 2, (inputs, context) => {
    const elements = items(inputs, 'count', context);
    const procedure = body(inputs, 1, 'count', context);
    let total = 0n;
    for (const item of elements.slice()) {
      if (matches(procedure, item, 'count', context)) total++;
    }
    return int(total);
  });

  interpreter.defineMethod('with-index', 'array', 1, (inputs, context) => array(items(inputs, 'with-index', context).map((item, i) => array([int(BigInt(i)), item]))));

  interpreter.defineMethod('copy', 'array', 1, (inputs, context) => array(items(inputs, 'copy', context).slice()));
}
