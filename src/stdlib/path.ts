import { absolutePath } from '../file-system.ts';
import type { Interpreter } from '../interpreter.ts';
import { joinPaths, parentPath } from '../runtime/path.ts';
import { string } from '../values.ts';
import { expectString, input } from './core.ts';

export function registerPath(interpreter: Interpreter): void {
  interpreter.defineIn('path', 'join', { min: 2, max: null }, (inputs, context) => {
    const base = expectString(input(inputs, 0), 'the path of `path/join`', context);
    const parts = inputs.slice(1).map((part) => expectString(part, 'each part given to `path/join`', context));
    return string(joinPaths(base, parts));
  });

  interpreter.defineIn('path', 'parent', 1, (inputs, context) => string(parentPath(expectString(input(inputs, 0), 'the path of `path/parent`', context))));

  interpreter.defineIn('path', 'this-directory', 0, (_inputs, context) => {
    const file = context.position.file;
    return string(file === undefined ? absolutePath('.') : parentPath(absolutePath(file)));
  });
}
