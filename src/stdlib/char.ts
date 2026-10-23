import type { Interpreter } from '../interpreter.ts';
import { isDigit, isLetter, isSpace, length, lower, upper } from '../runtime/text.ts';
import { boolean, char, int, string } from '../values.ts';
import { input, expectChar } from './core.ts';

function singleCodePointOr(original: string, mapped: string): string {
  return length(mapped) === 1 ? mapped : original;
}

export function registerChar(interpreter: Interpreter): void {
  interpreter.defineMethod('to-int', 'char', 1, (inputs, context) => {
    const cursor = expectChar(input(inputs, 0), 'the input of `to-int`', context);
    return int(BigInt(cursor.codePointAt(0) ?? 0));
  });

  interpreter.defineMethod('upper', 'char', 1, (inputs, context) => {
    const cursor = expectChar(input(inputs, 0), 'the input of `upper`', context);
    return char(singleCodePointOr(cursor, upper(cursor)));
  });

  interpreter.defineMethod('lower', 'char', 1, (inputs, context) => {
    const cursor = expectChar(input(inputs, 0), 'the input of `lower`', context);
    return char(singleCodePointOr(cursor, lower(cursor)));
  });

  interpreter.defineMethod('is-letter', 'char', 1, (inputs, context) => boolean(isLetter(expectChar(input(inputs, 0), 'the input of `is-letter`', context))));

  interpreter.defineMethod('is-digit', 'char', 1, (inputs, context) => boolean(isDigit(expectChar(input(inputs, 0), 'the input of `is-digit`', context))));

  interpreter.defineMethod('is-space', 'char', 1, (inputs, context) => boolean(isSpace(expectChar(input(inputs, 0), 'the input of `is-space`', context))));

  interpreter.defineMethod('to-string', 'char', 1, (inputs, context) => string(expectChar(input(inputs, 0), 'the input of `to-string`', context)));
}
