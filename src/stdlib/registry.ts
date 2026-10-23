import type { Interpreter } from '../interpreter.ts';
import { registerArray } from './array.ts';
import { registerBoolean } from './boolean.ts';
import { registerChar } from './char.ts';
import { registerCore } from './core.ts';
import { registerDate } from './date.ts';
import { registerFloat } from './float.ts';
import { registerHashmap } from './hashmap.ts';
import { registerInt } from './int.ts';
import { registerSet } from './set.ts';
import { registerString } from './string.ts';

export function registerStdlib(interp: Interpreter): void {
  registerCore(interp);
  registerInt(interp);
  registerFloat(interp);
  registerChar(interp);
  registerBoolean(interp);
  registerString(interp);
  registerArray(interp);
  registerHashmap(interp);
  registerSet(interp);
  registerDate(interp);
}
