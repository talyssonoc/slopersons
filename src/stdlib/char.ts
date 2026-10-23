import type { Interpreter } from '../interpreter.ts';
import { isDigit, isLetter, isSpace, length, lower, upper } from '../runtime/text.ts';
import { bool, char, int, str } from '../values.ts';
import { arg, expectChar } from './core.ts';

function singleCodePointOr(original: string, mapped: string): string {
  return length(mapped) === 1 ? mapped : original;
}

export function registerChar(interp: Interpreter): void {
  interp.defineMethod('to-int', 'char', 1, (args, ctx) => {
    const c = expectChar(arg(args, 0), 'the input of `to-int`', ctx);
    return int(BigInt(c.codePointAt(0) ?? 0));
  });

  interp.defineMethod('upper', 'char', 1, (args, ctx) => {
    const c = expectChar(arg(args, 0), 'the input of `upper`', ctx);
    return char(singleCodePointOr(c, upper(c)));
  });

  interp.defineMethod('lower', 'char', 1, (args, ctx) => {
    const c = expectChar(arg(args, 0), 'the input of `lower`', ctx);
    return char(singleCodePointOr(c, lower(c)));
  });

  interp.defineMethod('is-letter', 'char', 1, (args, ctx) => bool(isLetter(expectChar(arg(args, 0), 'the input of `is-letter`', ctx))));

  interp.defineMethod('is-digit', 'char', 1, (args, ctx) => bool(isDigit(expectChar(arg(args, 0), 'the input of `is-digit`', ctx))));

  interp.defineMethod('is-space', 'char', 1, (args, ctx) => bool(isSpace(expectChar(arg(args, 0), 'the input of `is-space`', ctx))));

  interp.defineMethod('to-string', 'char', 1, (args, ctx) => str(expectChar(arg(args, 0), 'the input of `to-string`', ctx)));
}
