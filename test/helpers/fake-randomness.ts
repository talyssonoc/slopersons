import type { Randomness } from '../../src/runtime/random.ts';

export interface ScriptedRandomness extends Randomness {
  used: number;
}

export function scriptedRandomness(bytes: readonly number[]): ScriptedRandomness {
  const randomness: ScriptedRandomness = {
    used: 0,
    fill: (buffer) => {
      for (let i = 0; i < buffer.length; i++) {
        const byte = bytes[randomness.used];
        if (byte === undefined) throw new Error(`the scripted randomness ran out after ${bytes.length} bytes`);
        buffer[i] = byte;
        randomness.used++;
      }
    },
  };
  return randomness;
}
