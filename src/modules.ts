import { readFileSync } from 'node:fs';
import { basename, dirname, relative, resolve } from 'node:path';
import { runtimeError } from './errors.ts';
import type { CallContext, Interpreter } from './interpreter.ts';
import { parse } from './parser.ts';
import { array, boolean, describeType, formatValue, freshId, string, type ModuleValue, type Value } from './values.ts';
import { expectString, input } from './stdlib/core.ts';

const EXTENSION = '.slop';

function displayPath(absolute: string): string {
  const shown = relative(process.cwd(), absolute);
  return shown === '' || shown.startsWith('..') ? absolute : shown;
}

function expectModule(value: Value, what: string, context: CallContext): ModuleValue {
  if (value.type !== 'module') throw runtimeError(`${what} must be a module, got ${describeType(value)}`, context.position);
  return value;
}

export function registerModules(interpreter: Interpreter): void {
  const loaded = new Map<string, ModuleValue>();
  const loading: string[] = [];

  const load = (requested: string, context: CallContext): ModuleValue => {
    const base = interpreter.currentFile === null ? process.cwd() : dirname(resolve(interpreter.currentFile));
    const target = requested.endsWith(EXTENSION) ? requested : `${requested}${EXTENSION}`;
    const absolute = resolve(base, target);
    const shown = displayPath(absolute);
    const cached = loaded.get(absolute);
    if (cached !== undefined) return cached;
    if (loading.includes(absolute)) {
      const chain = [...loading.slice(loading.indexOf(absolute)), absolute].map(displayPath).join(' -> ');
      throw runtimeError(`circular import: ${chain}`, context.position);
    }
    let source: string;
    try {
      source = readFileSync(absolute, 'utf8');
    } catch {
      throw runtimeError(`cannot read module "${requested}" (looked for ${shown})`, context.position);
    }
    loading.push(absolute);
    try {
      const run = interpreter.runModule(parse(source, shown), absolute);
      const members = new Map<string, Value>();
      for (const request of run.exports) {
        const value = run.environment.lookup(request.name);
        if (value === undefined) throw runtimeError(`\`export\` names \`${request.name}\`, which ${shown} does not bind`, request.position);
        members.set(request.name, value);
      }
      const name = basename(absolute, EXTENSION);
      const module: ModuleValue = { type: 'module', id: freshId(), name, path: absolute, members };
      loaded.set(absolute, module);
      return module;
    } finally {
      loading.pop();
    }
  };

  interpreter.defineBuiltin('use', 1, (inputs, context) => load(expectString(input(inputs, 0), 'the path of `use`', context), context));

  interpreter.defineMethod('at', 'module', 2, (inputs, context) => {
    const module = expectModule(input(inputs, 0), 'the input of `at`', context);
    const name = expectString(input(inputs, 1), 'the name of `at`', context);
    const member = module.members.get(name);
    if (member === undefined) throw runtimeError(`module \`${module.name}\` has no exported name ${formatValue(input(inputs, 1), 'show')}`, context.position);
    return member;
  });

  interpreter.defineMethod('has', 'module', 2, (inputs, context) => {
    const module = expectModule(input(inputs, 0), 'the input of `has`', context);
    return boolean(module.members.has(expectString(input(inputs, 1), 'the name of `has`', context)));
  });

  interpreter.defineMethod('names', 'module', 1, (inputs, context) => {
    const module = expectModule(input(inputs, 0), 'the input of `names`', context);
    return array([...module.members.keys()].map(string));
  });

  interpreter.defineMethod('path', 'module', 1, (inputs, context) => string(displayPath(expectModule(input(inputs, 0), 'the input of `path`', context).path)));

}
