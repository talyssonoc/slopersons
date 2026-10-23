import { runtimeError } from '../errors.ts';
import { arithmetic, type CallContext, type Interpreter } from '../interpreter.ts';
import { stableSort } from '../runtime/sorting.ts';
import { NOTHING, array, boolean, compareValues, describeType, int, newSet, string, valuesEqual, type Value } from '../values.ts';
import { input, callLambda, expectArray, expectDecision, expectInt, expectProc, expectString, toIndex } from './core.ts';

function items(inputs: Value[], name: string, context: CallContext): Value[] {
  return expectArray(input(inputs, 0), `the input of \`array/${name}\``, context);
}

function body(inputs: Value[], index: number, name: string, context: CallContext): Value {
  return expectProc(input(inputs, index), `the body of \`array/${name}\``, context);
}

function matches(procedure: Value, item: Value, name: string, context: CallContext): boolean {
  return expectDecision(callLambda(procedure, [item], context), `the condition in \`array/${name}\``, context);
}

function indexInto(items: Value[], value: Value, name: string, context: CallContext, allowEnd = false): number {
  const index = toIndex(value, `the index of \`array/${name}\``, context);
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
  if (items.length === 0) throw runtimeError(`cannot take \`array/${name}\` of an empty array`, context.position);
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
  interpreter.defineIn('array', 'length', 1, (inputs, context) => int(BigInt(items(inputs, 'length', context).length)));

  interpreter.defineIn('array', 'is-empty', 1, (inputs, context) => boolean(items(inputs, 'is-empty', context).length === 0));

  interpreter.defineIn('array', 'at', 2, (inputs, context) => {
    const elements = items(inputs, 'at', context);
    return elements[indexInto(elements, input(inputs, 1), 'at', context)] ?? NOTHING;
  });

  interpreter.defineIn('array', 'put', 3, (inputs, context) => {
    const elements = items(inputs, 'put', context);
    elements[indexInto(elements, input(inputs, 1), 'put', context)] = input(inputs, 2);
    return input(inputs, 0);
  });

  interpreter.defineIn('array', 'push', 2, (inputs, context) => {
    items(inputs, 'push', context).push(input(inputs, 1));
    return input(inputs, 0);
  });

  interpreter.defineIn('array', 'pop', 1, (inputs, context) => {
    const elements = items(inputs, 'pop', context);
    if (elements.length === 0) throw runtimeError('cannot pop from an empty array', context.position);
    return elements.pop() ?? NOTHING;
  });

  interpreter.defineIn('array', 'insert', 3, (inputs, context) => {
    const elements = items(inputs, 'insert', context);
    elements.splice(indexInto(elements, input(inputs, 1), 'insert', context, true), 0, input(inputs, 2));
    return input(inputs, 0);
  });

  interpreter.defineIn('array', 'remove-at', 2, (inputs, context) => {
    const elements = items(inputs, 'remove-at', context);
    elements.splice(indexInto(elements, input(inputs, 1), 'remove-at', context), 1);
    return input(inputs, 0);
  });

  interpreter.defineIn('array', 'first', 1, (inputs, context) => {
    const elements = items(inputs, 'first', context);
    nonEmpty(elements, 'first', context);
    return elements[0] ?? NOTHING;
  });

  interpreter.defineIn('array', 'last', 1, (inputs, context) => {
    const elements = items(inputs, 'last', context);
    nonEmpty(elements, 'last', context);
    return elements[elements.length - 1] ?? NOTHING;
  });

  interpreter.defineIn('array', 'slice', 3, (inputs, context) => {
    const elements = items(inputs, 'slice', context);
    const start = clampBound(input(inputs, 1), 'the start of `array/slice`', elements.length, context);
    const end = clampBound(input(inputs, 2), 'the end of `array/slice`', elements.length, context);
    return array(end <= start ? [] : elements.slice(start, end));
  });

  interpreter.defineIn('array', 'concat', 2, (inputs, context) => {
    const elements = items(inputs, 'concat', context);
    const other = expectArray(input(inputs, 1), 'the argument of `array/concat`', context);
    return array([...elements, ...other]);
  });

  interpreter.defineIn('array', 'flatten', 1, (inputs, context) => {
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

  interpreter.defineIn('array', 'zip', 2, (inputs, context) => {
    const elements = items(inputs, 'zip', context);
    const other = expectArray(input(inputs, 1), 'the argument of `array/zip`', context);
    const out: Value[] = [];
    const count = Math.min(elements.length, other.length);
    for (let i = 0; i < count; i++) {
      const left = elements[i];
      const right = other[i];
      if (left !== undefined && right !== undefined) out.push(array([left, right]));
    }
    return array(out);
  });

  interpreter.defineIn('array', 'contains', 2, (inputs, context) => {
    const target = input(inputs, 1);
    return boolean(items(inputs, 'contains', context).some((item) => valuesEqual(item, target)));
  });

  interpreter.defineIn('array', 'index-of', 2, (inputs, context) => {
    const elements = items(inputs, 'index-of', context);
    const target = input(inputs, 1);
    for (let i = 0; i < elements.length; i++) {
      const item = elements[i];
      if (item !== undefined && valuesEqual(item, target)) return int(BigInt(i));
    }
    return NOTHING;
  });

  interpreter.defineIn('array', 'sum', 1, (inputs, context) => {
    let total: Value = int(0n);
    for (const item of items(inputs, 'sum', context)) {
      if (item.type !== 'int' && item.type !== 'float') {
        throw runtimeError(`\`array/sum\` needs an array of numbers, but found ${describeType(item)}`, context.position);
      }
      total = arithmetic('+', total, item, context.position);
    }
    return total;
  });

  interpreter.defineIn('array', 'min', 1, (inputs, context) => extreme(items(inputs, 'min', context), 'min', (cursor) => cursor < 0, context));

  interpreter.defineIn('array', 'max', 1, (inputs, context) => extreme(items(inputs, 'max', context), 'max', (cursor) => cursor > 0, context));

  interpreter.defineIn('array', 'unique', 1, (inputs, context) => {
    const seen = newSet();
    const out: Value[] = [];
    for (const item of items(inputs, 'unique', context)) {
      if (seen.table.has(item)) continue;
      seen.table.set(item, true);
      out.push(item);
    }
    return array(out);
  });

  interpreter.defineIn('array', 'reverse', 1, (inputs, context) => {
    const elements = items(inputs, 'reverse', context);
    const out: Value[] = [];
    for (let i = elements.length - 1; i >= 0; i--) {
      const item = elements[i];
      if (item !== undefined) out.push(item);
    }
    return array(out);
  });

  interpreter.defineIn('array', 'join', 2, (inputs, context) => {
    const elements = items(inputs, 'join', context);
    const separator = expectString(input(inputs, 1), 'the separator of `array/join`', context);
    let out = '';
    for (let i = 0; i < elements.length; i++) {
      const item = elements[i];
      if (item === undefined) continue;
      if (item.type !== 'string') throw runtimeError(`\`array/join\` needs an array of strings, but found ${describeType(item)}`, context.position);
      if (i > 0) out += separator;
      out += item.value;
    }
    return string(out);
  });

  interpreter.defineIn('array', 'sort', 1, (inputs, context) => array(stableSort(items(inputs, 'sort', context), (left, right) => compareValues(left, right, context.position))));

  interpreter.defineIn('array', 'sort-by', 2, (inputs, context) => {
    const elements = items(inputs, 'sort-by', context);
    const procedure = body(inputs, 1, 'sort-by', context);
    const before = (left: Value, right: Value): boolean => expectDecision(callLambda(procedure, [left, right], context), 'the comparison in `array/sort-by`', context);
    return array(stableSort(elements, (left, right) => (before(left, right) ? -1 : before(right, left) ? 1 : 0)));
  });

  interpreter.defineIn('array', 'map', 2, (inputs, context) => {
    const elements = items(inputs, 'map', context);
    const procedure = body(inputs, 1, 'map', context);
    return array(elements.slice().map((item) => callLambda(procedure, [item], context)));
  });

  interpreter.defineIn('array', 'keep', 2, (inputs, context) => {
    const elements = items(inputs, 'keep', context);
    const procedure = body(inputs, 1, 'keep', context);
    return array(elements.slice().filter((item) => matches(procedure, item, 'keep', context)));
  });

  interpreter.defineIn('array', 'reject', 2, (inputs, context) => {
    const elements = items(inputs, 'reject', context);
    const procedure = body(inputs, 1, 'reject', context);
    return array(elements.slice().filter((item) => !matches(procedure, item, 'reject', context)));
  });

  interpreter.defineIn('array', 'reduce', 3, (inputs, context) => {
    const elements = items(inputs, 'reduce', context);
    const procedure = body(inputs, 2, 'reduce', context);
    let accumulator = input(inputs, 1);
    for (const item of elements.slice()) accumulator = callLambda(procedure, [accumulator, item], context);
    return accumulator;
  });

  interpreter.defineIn('array', 'any', 2, (inputs, context) => {
    const elements = items(inputs, 'any', context);
    const procedure = body(inputs, 1, 'any', context);
    for (const item of elements.slice()) {
      if (matches(procedure, item, 'any', context)) return boolean(true);
    }
    return boolean(false);
  });

  interpreter.defineIn('array', 'all', 2, (inputs, context) => {
    const elements = items(inputs, 'all', context);
    const procedure = body(inputs, 1, 'all', context);
    for (const item of elements.slice()) {
      if (!matches(procedure, item, 'all', context)) return boolean(false);
    }
    return boolean(true);
  });

  interpreter.defineIn('array', 'find', 2, (inputs, context) => {
    const elements = items(inputs, 'find', context);
    const procedure = body(inputs, 1, 'find', context);
    for (const item of elements.slice()) {
      if (matches(procedure, item, 'find', context)) return item;
    }
    return NOTHING;
  });

  interpreter.defineIn('array', 'count', 2, (inputs, context) => {
    const elements = items(inputs, 'count', context);
    const procedure = body(inputs, 1, 'count', context);
    let total = 0n;
    for (const item of elements.slice()) {
      if (matches(procedure, item, 'count', context)) total++;
    }
    return int(total);
  });

  interpreter.defineIn('array', 'with-index', 1, (inputs, context) => array(items(inputs, 'with-index', context).map((item, i) => array([int(BigInt(i)), item]))));

  interpreter.defineIn('array', 'copy', 1, (inputs, context) => array(items(inputs, 'copy', context).slice()));
}
