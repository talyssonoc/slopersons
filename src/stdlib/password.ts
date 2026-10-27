import { pbkdf2Sha256, sameBytes } from '../crypto.ts';
import { runtimeError } from '../errors.ts';
import type { CallContext, Interpreter } from '../interpreter.ts';
import { split } from '../runtime/text.ts';
import { encodeUtf8 } from '../runtime/utf8.ts';
import { boolean, string } from '../values.ts';
import { expectString, input } from './core.ts';

const SCHEME = 'pbkdf2-sha256';
const ITERATIONS = 600_000;
const SALT_BYTES = 16;
const KEY_BYTES = 32;
const MOST_ITERATIONS = 10_000_000;
const HEX_DIGITS = '0123456789abcdef';

function toHex(bytes: Uint8Array): string {
  let text = '';
  for (const byte of bytes) text += `${HEX_DIGITS[byte >> 4]}${HEX_DIGITS[byte & 0x0f]}`;
  return text;
}

function hexDigit(digit: string): number | null {
  const code = digit.codePointAt(0) ?? 0;
  if (code >= 48 && code <= 57) return code - 48;
  if (code >= 97 && code <= 102) return code - 87;
  return null;
}

function fromHex(text: string): Uint8Array | null {
  if (text.length === 0 || text.length % 2 !== 0) return null;
  const bytes = new Uint8Array(text.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    const high = hexDigit(text[2 * i] ?? '');
    const low = hexDigit(text[2 * i + 1] ?? '');
    if (high === null || low === null) return null;
    bytes[i] = high * 16 + low;
  }
  return bytes;
}

function iterationsFrom(text: string): number | null {
  if (text.length === 0 || text.length > 8 || text[0] === '0') return null;
  let count = 0;
  for (const digit of text) {
    const code = digit.codePointAt(0) ?? 0;
    if (code < 48 || code > 57) return null;
    count = count * 10 + (code - 48);
  }
  return count <= MOST_ITERATIONS ? count : null;
}

interface StoredHash {
  iterations: number;
  salt: Uint8Array;
  key: Uint8Array;
}

function parseStored(text: string, context: CallContext): StoredHash {
  const invalid = () => runtimeError(`the stored hash given to \`password/verify\` is not one \`password/hash\` makes`, context.position);
  const parts = split(text, '$');
  if (parts.length !== 4 || parts[0] !== SCHEME) throw invalid();
  const iterations = iterationsFrom(parts[1] ?? '');
  const salt = fromHex(parts[2] ?? '');
  const key = fromHex(parts[3] ?? '');
  if (iterations === null || salt === null || key === null) throw invalid();
  return { iterations, salt, key };
}

export function registerPassword(interpreter: Interpreter): void {
  interpreter.defineIn('password', 'hash', 1, (inputs, context) => {
    const password = expectString(input(inputs, 0), 'the input of `password/hash`', context);
    const salt = new Uint8Array(SALT_BYTES);
    context.interpreter.randomness.fill(salt);
    const key = pbkdf2Sha256(encodeUtf8(password), salt, ITERATIONS, KEY_BYTES);
    return string(`${SCHEME}$${ITERATIONS}$${toHex(salt)}$${toHex(key)}`);
  });

  interpreter.defineIn('password', 'verify', 2, (inputs, context) => {
    const password = expectString(input(inputs, 0), 'the input of `password/verify`', context);
    const stored = parseStored(expectString(input(inputs, 1), 'the stored hash given to `password/verify`', context), context);
    const key = pbkdf2Sha256(encodeUtf8(password), stored.salt, stored.iterations, stored.key.length);
    return boolean(sameBytes(key, stored.key));
  });
}
