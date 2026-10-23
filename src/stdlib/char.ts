import type { Interpreter } from '../interpreter.ts';
import { isDigit, isLetter, isSpace, length, lower, upper } from '../runtime/text.ts';
import { boolean, char, int, string } from '../values.ts';
import { input, expectChar } from './core.ts';

function singleCodePointOr(original: string, mapped: string): string {
  return length(mapped) === 1 ? mapped : original;
}

export function registerChar(interpreter: Interpreter): void {
  interpreter.defineIn('char', 'to-int', 1, (inputs, context) => {
    const cursor = expectChar(input(inputs, 0), 'the input of `char/to-int`', context);
    return int(BigInt(cursor.codePointAt(0) ?? 0));
  });

  interpreter.defineIn('char', 'upper', 1, (inputs, context) => {
    const cursor = expectChar(input(inputs, 0), 'the input of `char/upper`', context);
    return char(singleCodePointOr(cursor, upper(cursor)));
  });

  interpreter.defineIn('char', 'lower', 1, (inputs, context) => {
    const cursor = expectChar(input(inputs, 0), 'the input of `char/lower`', context);
    return char(singleCodePointOr(cursor, lower(cursor)));
  });

  interpreter.defineIn('char', 'is-letter', 1, (inputs, context) => boolean(isLetter(expectChar(input(inputs, 0), 'the input of `char/is-letter`', context))));

  interpreter.defineIn('char', 'is-digit', 1, (inputs, context) => boolean(isDigit(expectChar(input(inputs, 0), 'the input of `char/is-digit`', context))));

  interpreter.defineIn('char', 'is-space', 1, (inputs, context) => boolean(isSpace(expectChar(input(inputs, 0), 'the input of `char/is-space`', context))));

  interpreter.defineIn('char', 'to-string', 1, (inputs, context) => string(expectChar(input(inputs, 0), 'the input of `char/to-string`', context)));
}
