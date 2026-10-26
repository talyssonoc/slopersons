export interface Randomness {
  fill(bytes: Uint8Array): void;
}

export const NO_RANDOMNESS: Randomness = {
  fill: () => {
    throw new Error('the interpreter was created without a source of random bytes');
  },
};

const HEX_DIGITS = '0123456789abcdef';
const FLOAT_BITS = 53n;

function bytesToBigInt(bytes: Uint8Array): bigint {
  let value = 0n;
  for (const byte of bytes) value = (value << 8n) | BigInt(byte);
  return value;
}

// Rejection rather than `% bound`: when the range does not divide 256^n evenly, a remainder
// would make the low values come up more often than the rest.
export function randomBelow(randomness: Randomness, bound: bigint): bigint {
  if (bound <= 0n) throw new Error(`randomBelow needs a positive bound, got ${bound}`);
  const top = bound - 1n;
  if (top === 0n) return 0n;
  const bits = top.toString(2).length;
  const bytes = new Uint8Array(Math.ceil(bits / 8));
  const mask = 0xff >> (bytes.length * 8 - bits);
  for (;;) {
    randomness.fill(bytes);
    bytes[0] = (bytes[0] ?? 0) & mask;
    const value = bytesToBigInt(bytes);
    if (value <= top) return value;
  }
}

export function randomBetween(randomness: Randomness, low: bigint, high: bigint): bigint {
  return low + randomBelow(randomness, high - low + 1n);
}

// 53 bits is the precision of a float, so every result is a multiple of 2^-53 below 1.
export function randomFloat(randomness: Randomness): number {
  const bytes = new Uint8Array(7);
  randomness.fill(bytes);
  return Number(bytesToBigInt(bytes) >> (56n - FLOAT_BITS)) / 2 ** Number(FLOAT_BITS);
}

export function shuffled<Item>(randomness: Randomness, items: readonly Item[]): Item[] {
  const result = items.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Number(randomBelow(randomness, BigInt(i + 1)));
    const item = result[i] as Item;
    result[i] = result[j] as Item;
    result[j] = item;
  }
  return result;
}

export function randomHex(randomness: Randomness, length: number): string {
  const bytes = new Uint8Array(Math.ceil(length / 2));
  randomness.fill(bytes);
  let text = '';
  for (const byte of bytes) text += `${HEX_DIGITS[byte >> 4]}${HEX_DIGITS[byte & 0x0f]}`;
  return length % 2 === 0 ? text : text.slice(0, length);
}
