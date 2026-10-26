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
import { randomHex } from '../runtime/random.ts';
import { utf8Length } from '../runtime/utf8.ts';
import { NOTHING, array, boolean, char, float, formatValue, int, string, type Value } from '../values.ts';
import { input, callLambda, checkSize, expectArray, expectChar, expectInt, expectProc, expectString, runLoopBody } from './core.ts';

function receiver(inputs: Value[], name: string, context: CallContext): string {
  return expectString(input(inputs, 0), `the input of \`string/${name}\``, context);
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
  interpreter.defineIn('string', 'random-hex', 1, (inputs, context) => {
    const length = expectInt(input(inputs, 0), 'the length of `string/random-hex`', context);
    if (length < 0n) throw runtimeError(`the length of \`string/random-hex\` cannot be negative, got ${length}`, context.position);
    return string(randomHex(context.interpreter.randomness, checkSize(length, 'string/random-hex', 'characters', context)));
  });

  interpreter.defineIn('string', 'length', 1, (inputs, context) => int(BigInt(length(receiver(inputs, 'length', context)))));

  interpreter.defineIn('string', 'byte-length', 1, (inputs, context) => int(BigInt(utf8Length(receiver(inputs, 'byte-length', context)))));

  interpreter.defineIn('string', 'chars', 1, (inputs, context) => {
    const items: Value[] = [];
    for (const codePoint of receiver(inputs, 'chars', context)) items.push(char(codePoint));
    return array(items);
  });

  interpreter.defineIn('string', 'at', 2, (inputs, context) => {
    const text = receiver(inputs, 'at', context);
    const index = expectInt(input(inputs, 1), 'the index of `string/at`', context);
    const size = length(text);
    const codePoint = index < 0n || index >= BigInt(size) ? null : charAt(text, Number(index));
    if (codePoint === null) throw runtimeError(`index ${index} is out of range for a string of length ${size}`, context.position);
    return char(codePoint);
  });

  interpreter.defineIn('string', 'slice', 3, (inputs, context) => {
    const text = receiver(inputs, 'slice', context);
    const start = expectInt(input(inputs, 1), 'the start of `string/slice`', context);
    const end = expectInt(input(inputs, 2), 'the end of `string/slice`', context);
    const size = length(text);
    return string(slice(text, clampIndex(start, size), clampIndex(end, size)));
  });

  interpreter.defineIn('string', 'upper', 1, (inputs, context) => string(upper(receiver(inputs, 'upper', context))));

  interpreter.defineIn('string', 'lower', 1, (inputs, context) => string(lower(receiver(inputs, 'lower', context))));

  interpreter.defineIn('string', 'trim', 1, (inputs, context) => string(trim(receiver(inputs, 'trim', context))));

  interpreter.defineIn('string', 'trim-start', 1, (inputs, context) => string(trimStart(receiver(inputs, 'trim-start', context))));

  interpreter.defineIn('string', 'trim-end', 1, (inputs, context) => string(trimEnd(receiver(inputs, 'trim-end', context))));

  interpreter.defineIn('string', 'split', 2, (inputs, context) => {
    const text = receiver(inputs, 'split', context);
    const separator = expectString(input(inputs, 1), 'the separator of `string/split`', context);
    return strings(split(text, separator));
  });

  interpreter.defineIn('string', 'contains', 2, (inputs, context) => {
    const text = receiver(inputs, 'contains', context);
    const needle = expectString(input(inputs, 1), 'the text to look for in `string/contains`', context);
    return boolean(contains(text, needle));
  });

  interpreter.defineIn('string', 'starts-with', 2, (inputs, context) => {
    const text = receiver(inputs, 'starts-with', context);
    const prefix = expectString(input(inputs, 1), 'the prefix of `string/starts-with`', context);
    return boolean(startsWith(text, prefix));
  });

  interpreter.defineIn('string', 'ends-with', 2, (inputs, context) => {
    const text = receiver(inputs, 'ends-with', context);
    const suffix = expectString(input(inputs, 1), 'the suffix of `string/ends-with`', context);
    return boolean(endsWith(text, suffix));
  });

  interpreter.defineIn('string', 'index-of', 2, (inputs, context) => {
    const text = receiver(inputs, 'index-of', context);
    const needle = expectString(input(inputs, 1), 'the text to look for in `string/index-of`', context);
    const at = indexOf(text, needle);
    return at === -1 ? NOTHING : int(BigInt(at));
  });

  interpreter.defineIn('string', 'replace', 3, (inputs, context) => {
    const text = receiver(inputs, 'replace', context);
    const old = expectNeedle(input(inputs, 1), 'string/replace', context);
    const replacement = expectString(input(inputs, 2), 'the replacement of `string/replace`', context);
    return string(replaceAll(text, old, replacement));
  });

  interpreter.defineIn('string', 'repeat', 2, (inputs, context) => {
    const text = receiver(inputs, 'repeat', context);
    const count = expectInt(input(inputs, 1), 'the count of `string/repeat`', context);
    if (count < 0n) throw runtimeError(`the count of \`string/repeat\` cannot be negative, got ${count}`, context.position);
    checkSize(BigInt(length(text)) * count, 'string/repeat', 'characters', context);
    return string(repeat(text, Number(count)));
  });

  interpreter.defineIn('string', 'reverse', 1, (inputs, context) => string(reverse(receiver(inputs, 'reverse', context))));

  interpreter.defineIn('string', 'pad-left', 3, (inputs, context) => {
    const text = receiver(inputs, 'pad-left', context);
    checkSize(expectInt(input(inputs, 1), 'the width of `string/pad-left`', context), 'string/pad-left', 'characters', context);
    const width = expectInt(input(inputs, 1), 'the width of `string/pad-left`', context);
    const fill = expectChar(input(inputs, 2), 'the fill of `string/pad-left`', context);
    return string(padStart(text, Number(width), fill));
  });

  interpreter.defineIn('string', 'pad-right', 3, (inputs, context) => {
    const text = receiver(inputs, 'pad-right', context);
    checkSize(expectInt(input(inputs, 1), 'the width of `string/pad-right`', context), 'string/pad-right', 'characters', context);
    const width = expectInt(input(inputs, 1), 'the width of `string/pad-right`', context);
    const fill = expectChar(input(inputs, 2), 'the fill of `string/pad-right`', context);
    return string(padEnd(text, Number(width), fill));
  });

  interpreter.defineIn('string', 'lines', 1, (inputs, context) => strings(lines(receiver(inputs, 'lines', context))));

  interpreter.defineIn('string', 'words', 1, (inputs, context) => strings(words(receiver(inputs, 'words', context))));

  interpreter.defineIn('string', 'is-empty', 1, (inputs, context) => boolean(receiver(inputs, 'is-empty', context) === ''));

  interpreter.defineIn('string', 'to-int', 1, (inputs, context) => {
    const given = input(inputs, 0);
    const parsed = parseIntText(receiver(inputs, 'to-int', context));
    if (parsed === null) throw runtimeError(`cannot convert ${formatValue(given, 'show')} to an int`, context.position);
    return int(parsed);
  });

  interpreter.defineIn('string', 'to-float', 1, (inputs, context) => {
    const given = input(inputs, 0);
    const parsed = parseFloatText(receiver(inputs, 'to-float', context));
    if (parsed === null) throw runtimeError(`cannot convert ${formatValue(given, 'show')} to a float`, context.position);
    if (!Number.isFinite(parsed)) throw runtimeError(`${formatValue(given, 'show')} is too large for a float`, context.position);
    return float(parsed);
  });

  interpreter.defineIn('string', 'to-string', 1, (inputs, context) => string(receiver(inputs, 'to-string', context)));

  interpreter.defineIn('string', 'from-chars', 1, (inputs, context) => {
    const items = expectArray(input(inputs, 0), 'the input of `string/from-chars`', context);
    let out = '';
    for (let i = 0; i < items.length; i++) {
      out += expectChar(input(items, i), `element ${i} of the input of \`string/from-chars\``, context);
    }
    return string(out);
  });

  interpreter.defineIn('string', 'each', 2, (inputs, context) => {
    const text = receiver(inputs, 'each', context);
    const procedure = expectProc(input(inputs, 1), 'the body of `string/each`', context);
    for (const codePoint of text) {
      if (!runLoopBody(() => callLambda(procedure, [char(codePoint)], context))) break;
    }
    return NOTHING;
  });

  interpreter.defineIn('string', 'count', 2, (inputs, context) => {
    const text = receiver(inputs, 'count', context);
    const needle = expectNeedle(input(inputs, 1), 'string/count', context);
    return int(BigInt(countOccurrences(text, needle)));
  });
}
