import type { Interpreter } from '../interpreter.ts';
import { registerSourceModule } from '../modules.ts';
import { registerArray } from './array.ts';
import { registerBoolean } from './boolean.ts';
import { registerChar } from './char.ts';
import { registerCore } from './core.ts';
import { registerDate } from './date.ts';
import { registerDatetime } from './datetime.ts';
import { registerFile } from './file.ts';
import { registerFloat } from './float.ts';
import { registerHashmap } from './hashmap.ts';
import { registerInt } from './int.ts';
import { registerIo } from './io.ts';
import { registerSet } from './set.ts';
import { registerStream } from './stream.ts';
import { registerString } from './string.ts';
import { registerTime } from './time.ts';

export function registerStdlib(interpreter: Interpreter): void {
  registerCore(interpreter);
  registerIo(interpreter);
  registerStream(interpreter);
  registerFile(interpreter);
  registerInt(interpreter);
  registerFloat(interpreter);
  registerChar(interpreter);
  registerBoolean(interpreter);
  registerString(interpreter);
  registerArray(interpreter);
  registerHashmap(interpreter);
  registerSet(interpreter);
  registerDate(interpreter);
  registerTime(interpreter);
  registerDatetime(interpreter);
  registerSourceModule(interpreter, 'json', new URL('./json.slop', import.meta.url));
}
