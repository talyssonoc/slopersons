import { runtimeError } from '../errors.ts';
import type { CallContext, Interpreter } from '../interpreter.ts';
import {
  charAt,
  contains,
  endsWith,
  indexOf,
  length,
  lines,
  lower,
  padEnd,
  padStart,
  parseFloatText,
  parseIntText,
  repeat,
  replaceAll,
  reverse,
  slice,
  split,
  startsWith,
  trim,
  trimEnd,
  trimStart,
  upper,
  words,
} from '../runtime/text.ts';
import { NOTHING, array, boolean, char, float, formatValue, int, string, type Value } from '../values.ts';
import { input, callLambda, checkSize, expectArray, expectChar, expectInt, expectProc, expectString, runLoopBody } from './core.ts';

function receiver(inputs: Value[], name: string, context: CallContext): string {
  return expectString(input(inputs, 0), `the input of \`${name}\``, context);
}

function strings(items: string[]): Value {
  return array(items.map(string));
}

function clampIndex(index: bigint, size: number): number {
  if (index < 0n) return 0;
  if (index > BigInt(size)) return size;
  return Number(index);
}

function expectNeedle(value: Value, name: string, context: CallContext): string {
  const needle = expectString(value, `the text to look for in \`${name}\``, context);
  if (needle === '') throw runtimeError(`\`${name}\` needs a non-empty text to look for`, context.position);
  return needle;
}

function countOccurrences(text: string, needle: string): number {
  const step = length(needle);
  let found = 0;
  let from = 0;
  while (true) {
    const at = indexOf(text, needle, from);
    if (at === -1) return found;
    found += 1;
    from = at + step;
  }
}

export function registerString(interpreter: Interpreter): void {
  interpreter.defineMethod('length', 'string', 1, (inputs, context) => int(BigInt(length(receiver(inputs, 'length', context)))));

  interpreter.defineMethod('chars', 'string', 1, (inputs, context) => {
    const items: Value[] = [];
    for (const codePoint of receiver(inputs, 'chars', context)) items.push(char(codePoint));
    return array(items);
  });

  interpreter.defineMethod('at', 'string', 2, (inputs, context) => {
    const text = receiver(inputs, 'at', context);
    const index = expectInt(input(inputs, 1), 'the index of `at`', context);
    const size = length(text);
    const codePoint = index < 0n || index >= BigInt(size) ? null : charAt(text, Number(index));
    if (codePoint === null) throw runtimeError(`index ${index} is out of range for a string of length ${size}`, context.position);
    return char(codePoint);
  });

  interpreter.defineMethod('slice', 'string', 3, (inputs, context) => {
    const text = receiver(inputs, 'slice', context);
    const start = expectInt(input(inputs, 1), 'the start of `slice`', context);
    const end = expectInt(input(inputs, 2), 'the end of `slice`', context);
    const size = length(text);
    return string(slice(text, clampIndex(start, size), clampIndex(end, size)));
  });

  interpreter.defineMethod('upper', 'string', 1, (inputs, context) => string(upper(receiver(inputs, 'upper', context))));

  interpreter.defineMethod('lower', 'string', 1, (inputs, context) => string(lower(receiver(inputs, 'lower', context))));

  interpreter.defineMethod('trim', 'string', 1, (inputs, context) => string(trim(receiver(inputs, 'trim', context))));

  interpreter.defineMethod('trim-start', 'string', 1, (inputs, context) => string(trimStart(receiver(inputs, 'trim-start', context))));

  interpreter.defineMethod('trim-end', 'string', 1, (inputs, context) => string(trimEnd(receiver(inputs, 'trim-end', context))));

  interpreter.defineMethod('split', 'string', 2, (inputs, context) => {
    const text = receiver(inputs, 'split', context);
    const separator = expectString(input(inputs, 1), 'the separator of `split`', context);
    return strings(split(text, separator));
  });

  interpreter.defineMethod('contains', 'string', 2, (inputs, context) => {
    const text = receiver(inputs, 'contains', context);
    const needle = expectString(input(inputs, 1), 'the text to look for in `contains`', context);
    return boolean(contains(text, needle));
  });

  interpreter.defineMethod('starts-with', 'string', 2, (inputs, context) => {
    const text = receiver(inputs, 'starts-with', context);
    const prefix = expectString(input(inputs, 1), 'the prefix of `starts-with`', context);
    return boolean(startsWith(text, prefix));
  });

  interpreter.defineMethod('ends-with', 'string', 2, (inputs, context) => {
    const text = receiver(inputs, 'ends-with', context);
    const suffix = expectString(input(inputs, 1), 'the suffix of `ends-with`', context);
    return boolean(endsWith(text, suffix));
  });

  interpreter.defineMethod('index-of', 'string', 2, (inputs, context) => {
    const text = receiver(inputs, 'index-of', context);
    const needle = expectString(input(inputs, 1), 'the text to look for in `index-of`', context);
    const at = indexOf(text, needle);
    return at === -1 ? NOTHING : int(BigInt(at));
  });

  interpreter.defineMethod('replace', 'string', 3, (inputs, context) => {
    const text = receiver(inputs, 'replace', context);
    const old = expectNeedle(input(inputs, 1), 'replace', context);
    const replacement = expectString(input(inputs, 2), 'the replacement of `replace`', context);
    return string(replaceAll(text, old, replacement));
  });

  interpreter.defineMethod('repeat', 'string', 2, (inputs, context) => {
    const text = receiver(inputs, 'repeat', context);
    const count = expectInt(input(inputs, 1), 'the count of `repeat`', context);
    if (count < 0n) throw runtimeError(`the count of \`repeat\` cannot be negative, got ${count}`, context.position);
    checkSize(BigInt(length(text)) * count, 'repeat', 'characters', context);
    return string(repeat(text, Number(count)));
  });

  interpreter.defineMethod('reverse', 'string', 1, (inputs, context) => string(reverse(receiver(inputs, 'reverse', context))));

  interpreter.defineMethod('pad-left', 'string', 3, (inputs, context) => {
    const text = receiver(inputs, 'pad-left', context);
    checkSize(expectInt(input(inputs, 1), 'the width of `pad-left`', context), 'pad-left', 'characters', context);
    const width = expectInt(input(inputs, 1), 'the width of `pad-left`', context);
    const fill = expectChar(input(inputs, 2), 'the fill of `pad-left`', context);
    return string(padStart(text, Number(width), fill));
  });

  interpreter.defineMethod('pad-right', 'string', 3, (inputs, context) => {
    const text = receiver(inputs, 'pad-right', context);
    checkSize(expectInt(input(inputs, 1), 'the width of `pad-right`', context), 'pad-right', 'characters', context);
    const width = expectInt(input(inputs, 1), 'the width of `pad-right`', context);
    const fill = expectChar(input(inputs, 2), 'the fill of `pad-right`', context);
    return string(padEnd(text, Number(width), fill));
  });

  interpreter.defineMethod('lines', 'string', 1, (inputs, context) => strings(lines(receiver(inputs, 'lines', context))));

  interpreter.defineMethod('words', 'string', 1, (inputs, context) => strings(words(receiver(inputs, 'words', context))));

  interpreter.defineMethod('is-empty', 'string', 1, (inputs, context) => boolean(receiver(inputs, 'is-empty', context) === ''));

  interpreter.defineMethod('to-int', 'string', 1, (inputs, context) => {
    const given = input(inputs, 0);
    const parsed = parseIntText(receiver(inputs, 'to-int', context));
    if (parsed === null) throw runtimeError(`cannot convert ${formatValue(given, 'show')} to an int`, context.position);
    return int(parsed);
  });

  interpreter.defineMethod('to-float', 'string', 1, (inputs, context) => {
    const given = input(inputs, 0);
    const parsed = parseFloatText(receiver(inputs, 'to-float', context));
    if (parsed === null) throw runtimeError(`cannot convert ${formatValue(given, 'show')} to a float`, context.position);
    return float(parsed);
  });

  interpreter.defineMethod('to-string', 'string', 1, (inputs, context) => string(receiver(inputs, 'to-string', context)));

  interpreter.defineMethod('from-chars', 'array', 1, (inputs, context) => {
    const items = expectArray(input(inputs, 0), 'the input of `from-chars`', context);
    let out = '';
    for (let i = 0; i < items.length; i++) {
      out += expectChar(input(items, i), `element ${i} of the input of \`from-chars\``, context);
    }
    return string(out);
  });

  interpreter.defineMethod('each', 'string', 2, (inputs, context) => {
    const text = receiver(inputs, 'each', context);
    const procedure = expectProc(input(inputs, 1), 'the body of `each`', context);
    for (const codePoint of text) {
      if (!runLoopBody(() => callLambda(procedure, [char(codePoint)], context))) break;
    }
    return NOTHING;
  });

  interpreter.defineMethod('count', 'string', 2, (inputs, context) => {
    const text = receiver(inputs, 'count', context);
    const needle = expectNeedle(input(inputs, 1), 'count', context);
    return int(BigInt(countOccurrences(text, needle)));
  });
}
