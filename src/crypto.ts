import { pbkdf2Sync, timingSafeEqual } from 'node:crypto';

export function pbkdf2Sha256(password: Uint8Array, salt: Uint8Array, iterations: number, length: number): Uint8Array {
  return new Uint8Array(pbkdf2Sync(password, salt, iterations, length, 'sha256'));
}

export function sameBytes(first: Uint8Array, second: Uint8Array): boolean {
  return first.length === second.length && timingSafeEqual(first, second);
}
