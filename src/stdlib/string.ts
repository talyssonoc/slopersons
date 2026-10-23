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
import { NOTHING, array, bool, char, float, formatValue, int, str, type Value } from '../values.ts';
import { arg, callLambda, checkSize, expectArray, expectChar, expectInt, expectProc, expectString, runLoopBody } from './core.ts';

function receiver(args: Value[], name: string, ctx: CallContext): string {
  return expectString(arg(args, 0), `the input of \`${name}\``, ctx);
}

function strings(items: string[]): Value {
  return array(items.map(str));
}

function clampIndex(index: bigint, size: number): number {
  if (index < 0n) return 0;
  if (index > BigInt(size)) return size;
  return Number(index);
}

function expectNeedle(value: Value, name: string, ctx: CallContext): string {
  const needle = expectString(value, `the text to look for in \`${name}\``, ctx);
  if (needle === '') throw runtimeError(`\`${name}\` needs a non-empty text to look for`, ctx.pos);
  return needle;
}

function countOccurrences(s: string, needle: string): number {
  const step = length(needle);
  let found = 0;
  let from = 0;
  while (true) {
    const at = indexOf(s, needle, from);
    if (at === -1) return found;
    found += 1;
    from = at + step;
  }
}

export function registerString(interp: Interpreter): void {
  interp.defineMethod('length', 'string', 1, (args, ctx) => int(BigInt(length(receiver(args, 'length', ctx)))));

  interp.defineMethod('chars', 'string', 1, (args, ctx) => {
    const items: Value[] = [];
    for (const cp of receiver(args, 'chars', ctx)) items.push(char(cp));
    return array(items);
  });

  interp.defineMethod('at', 'string', 2, (args, ctx) => {
    const s = receiver(args, 'at', ctx);
    const index = expectInt(arg(args, 1), 'the index of `at`', ctx);
    const size = length(s);
    const cp = index < 0n || index >= BigInt(size) ? null : charAt(s, Number(index));
    if (cp === null) throw runtimeError(`index ${index} is out of range for a string of length ${size}`, ctx.pos);
    return char(cp);
  });

  interp.defineMethod('slice', 'string', 3, (args, ctx) => {
    const s = receiver(args, 'slice', ctx);
    const start = expectInt(arg(args, 1), 'the start of `slice`', ctx);
    const end = expectInt(arg(args, 2), 'the end of `slice`', ctx);
    const size = length(s);
    return str(slice(s, clampIndex(start, size), clampIndex(end, size)));
  });

  interp.defineMethod('upper', 'string', 1, (args, ctx) => str(upper(receiver(args, 'upper', ctx))));

  interp.defineMethod('lower', 'string', 1, (args, ctx) => str(lower(receiver(args, 'lower', ctx))));

  interp.defineMethod('trim', 'string', 1, (args, ctx) => str(trim(receiver(args, 'trim', ctx))));

  interp.defineMethod('trim-start', 'string', 1, (args, ctx) => str(trimStart(receiver(args, 'trim-start', ctx))));

  interp.defineMethod('trim-end', 'string', 1, (args, ctx) => str(trimEnd(receiver(args, 'trim-end', ctx))));

  interp.defineMethod('split', 'string', 2, (args, ctx) => {
    const s = receiver(args, 'split', ctx);
    const separator = expectString(arg(args, 1), 'the separator of `split`', ctx);
    return strings(split(s, separator));
  });

  interp.defineMethod('contains', 'string', 2, (args, ctx) => {
    const s = receiver(args, 'contains', ctx);
    const needle = expectString(arg(args, 1), 'the text to look for in `contains`', ctx);
    return bool(contains(s, needle));
  });

  interp.defineMethod('starts-with', 'string', 2, (args, ctx) => {
    const s = receiver(args, 'starts-with', ctx);
    const prefix = expectString(arg(args, 1), 'the prefix of `starts-with`', ctx);
    return bool(startsWith(s, prefix));
  });

  interp.defineMethod('ends-with', 'string', 2, (args, ctx) => {
    const s = receiver(args, 'ends-with', ctx);
    const suffix = expectString(arg(args, 1), 'the suffix of `ends-with`', ctx);
    return bool(endsWith(s, suffix));
  });

  interp.defineMethod('index-of', 'string', 2, (args, ctx) => {
    const s = receiver(args, 'index-of', ctx);
    const needle = expectString(arg(args, 1), 'the text to look for in `index-of`', ctx);
    const at = indexOf(s, needle);
    return at === -1 ? NOTHING : int(BigInt(at));
  });

  interp.defineMethod('replace', 'string', 3, (args, ctx) => {
    const s = receiver(args, 'replace', ctx);
    const old = expectNeedle(arg(args, 1), 'replace', ctx);
    const replacement = expectString(arg(args, 2), 'the replacement of `replace`', ctx);
    return str(replaceAll(s, old, replacement));
  });

  interp.defineMethod('repeat', 'string', 2, (args, ctx) => {
    const s = receiver(args, 'repeat', ctx);
    const count = expectInt(arg(args, 1), 'the count of `repeat`', ctx);
    if (count < 0n) throw runtimeError(`the count of \`repeat\` cannot be negative, got ${count}`, ctx.pos);
    checkSize(BigInt(length(s)) * count, 'repeat', 'characters', ctx);
    return str(repeat(s, Number(count)));
  });

  interp.defineMethod('reverse', 'string', 1, (args, ctx) => str(reverse(receiver(args, 'reverse', ctx))));

  interp.defineMethod('pad-left', 'string', 3, (args, ctx) => {
    const s = receiver(args, 'pad-left', ctx);
    checkSize(expectInt(arg(args, 1), 'the width of `pad-left`', ctx), 'pad-left', 'characters', ctx);
    const width = expectInt(arg(args, 1), 'the width of `pad-left`', ctx);
    const fill = expectChar(arg(args, 2), 'the fill of `pad-left`', ctx);
    return str(padStart(s, Number(width), fill));
  });

  interp.defineMethod('pad-right', 'string', 3, (args, ctx) => {
    const s = receiver(args, 'pad-right', ctx);
    checkSize(expectInt(arg(args, 1), 'the width of `pad-right`', ctx), 'pad-right', 'characters', ctx);
    const width = expectInt(arg(args, 1), 'the width of `pad-right`', ctx);
    const fill = expectChar(arg(args, 2), 'the fill of `pad-right`', ctx);
    return str(padEnd(s, Number(width), fill));
  });

  interp.defineMethod('lines', 'string', 1, (args, ctx) => strings(lines(receiver(args, 'lines', ctx))));

  interp.defineMethod('words', 'string', 1, (args, ctx) => strings(words(receiver(args, 'words', ctx))));

  interp.defineMethod('is-empty', 'string', 1, (args, ctx) => bool(receiver(args, 'is-empty', ctx) === ''));

  interp.defineMethod('to-int', 'string', 1, (args, ctx) => {
    const input = arg(args, 0);
    const parsed = parseIntText(receiver(args, 'to-int', ctx));
    if (parsed === null) throw runtimeError(`cannot convert ${formatValue(input, 'show')} to an int`, ctx.pos);
    return int(parsed);
  });

  interp.defineMethod('to-float', 'string', 1, (args, ctx) => {
    const input = arg(args, 0);
    const parsed = parseFloatText(receiver(args, 'to-float', ctx));
    if (parsed === null) throw runtimeError(`cannot convert ${formatValue(input, 'show')} to a float`, ctx.pos);
    return float(parsed);
  });

  interp.defineMethod('to-string', 'string', 1, (args, ctx) => str(receiver(args, 'to-string', ctx)));

  interp.defineMethod('from-chars', 'array', 1, (args, ctx) => {
    const items = expectArray(arg(args, 0), 'the input of `from-chars`', ctx);
    let out = '';
    for (let i = 0; i < items.length; i++) {
      out += expectChar(arg(items, i), `element ${i} of the input of \`from-chars\``, ctx);
    }
    return str(out);
  });

  interp.defineMethod('each', 'string', 2, (args, ctx) => {
    const s = receiver(args, 'each', ctx);
    const fn = expectProc(arg(args, 1), 'the body of `each`', ctx);
    for (const cp of s) {
      if (!runLoopBody(() => callLambda(fn, [char(cp)], ctx))) break;
    }
    return NOTHING;
  });

  interp.defineMethod('count', 'string', 2, (args, ctx) => {
    const s = receiver(args, 'count', ctx);
    const needle = expectNeedle(arg(args, 1), 'count', ctx);
    return int(BigInt(countOccurrences(s, needle)));
  });
}
