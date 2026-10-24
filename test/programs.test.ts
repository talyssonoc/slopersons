import { fileURLToPath } from 'node:url';
import { defineGoldenTests } from './helpers/golden.ts';

const bin = fileURLToPath(new URL('../bin/slopersons.mjs', import.meta.url));

defineGoldenTests('', () => [bin]);
