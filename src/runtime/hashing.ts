export const FNV_OFFSET = 0x811c9dc5;
export const FNV_PRIME = 0x01000193;

const NAN_HASH = 0x7ff80000;

function fnvStep(hash: number, byte: number): number {
  return Math.imul(hash ^ byte, FNV_PRIME) >>> 0;
}

export function hashString(text: string): number {
  let hash = FNV_OFFSET;
  for (let i = 0; i < text.length; i++) {
    const unit = text.charCodeAt(i);
    hash = fnvStep(hash, unit & 0xff);
    hash = fnvStep(hash, unit >>> 8);
  }
  return hash >>> 0;
}

export function hashCombine(seed: number, value: number): number {
  return (seed ^ (value + 0x9e3779b9 + (seed << 6) + (seed >>> 2))) >>> 0;
}

const numberBuffer = new DataView(new ArrayBuffer(8));

export function hashNumber(value: number): number {
  if (Number.isNaN(value)) {
    return NAN_HASH;
  }
  numberBuffer.setFloat64(0, value === 0 ? 0 : value);
  let hash = FNV_OFFSET;
  for (let i = 0; i < 8; i++) {
    hash = fnvStep(hash, numberBuffer.getUint8(i));
  }
  return hash >>> 0;
}

export function hashBigInt(value: bigint): number {
  const sign = value < 0n ? '-' : '+';
  const magnitude = value < 0n ? -value : value;
  return hashString(sign + magnitude.toString(16));
}

export function hashBoolean(value: boolean): number {
  return value ? 1231 : 1237;
}
