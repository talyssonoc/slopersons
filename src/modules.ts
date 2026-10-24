import { readFileSync } from 'node:fs';
import { basename, dirname, relative, resolve } from 'node:path';
import type { Statement } from './ast.ts';
import { SlopersonsError, runtimeError } from './errors.ts';
import type { CallContext, Interpreter } from './interpreter.ts';
import { parse } from './parser.ts';
import { array, boolean, describeType, formatValue, freshId, string, type ModuleValue, type ProcedureValue, type Value } from './values.ts';
import { expectString, input } from './stdlib/core.ts';

const EXTENSION = '.slop';

function displayPath(absolute: string): string {
  const shown = relative(process.cwd(), absolute);
  return shown === '' || shown.startsWith('..') ? absolute : shown;
}

const parsedSourceModules = new Map<string, Statement[]>();

declare const SLOPERSONS_SOURCE_MODULES: Record<string, string> | undefined;

export function standardSourceModule(name: string): string {
  if (typeof SLOPERSONS_SOURCE_MODULES === 'object') {
    const source = SLOPERSONS_SOURCE_MODULES[name];
    if (source === undefined) throw new Error(`the executable has no embedded source for the builtin module \`${name}\``);
    return source;
  }
  return readFileSync(new URL(`./stdlib/${name}.slop`, import.meta.url), 'utf8');
}

function callFromOutside(procedure: ProcedureValue, file: string, inputs: Value[], context: CallContext): Value {
  try {
    return context.interpreter.callValue(procedure, inputs, context.position, context.environment);
  } catch (error) {
    if (error instanceof SlopersonsError && error.position?.file === file) throw runtimeError(error.message, context.position);
    throw error;
  }
}

export function registerSourceModule(interpreter: Interpreter, name: string, source: string): void {
  const file = `<builtin ${name}>`;
  let program = parsedSourceModules.get(source);
  if (program === undefined) {
    program = parse(source, file);
    parsedSourceModules.set(source, program);
  }
  const run = interpreter.runModule(program, file);
  const atEnd = run.environment.lookup('at-end');
  if (atEnd !== undefined) {
    if (atEnd.type !== 'proc' || atEnd.parameters.length !== 0) throw new Error(`the builtin module \`${name}\` defines \`at-end\`, which must be a procedure with no inputs`);
    interpreter.endHooks.push(() => {
      const code = interpreter.callValue(atEnd, [], { line: 1, col: 1, file }, run.environment);
      if (code.type !== 'int' || code.value < 0n || code.value > 255n) throw new Error(`\`at-end\` in the builtin module \`${name}\` must return an exit code from 0 to 255`);
      return Number(code.value);
    });
  }
  for (const request of run.exports) {
    const value = run.environment.lookup(request.name);
    if (value === undefined) throw new Error(`the builtin module \`${name}\` exports \`${request.name}\`, which it does not bind`);
    if (value.type === 'proc') {
      interpreter.defineIn(name, request.name, value.parameters.length, (inputs, context) => callFromOutside(value, file, inputs, context));
    } else {
      interpreter.defineValueIn(name, request.name, value);
    }
  }
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

  interpreter.defineIn('module', 'at', 2, (inputs, context) => {
    const module = expectModule(input(inputs, 0), 'the input of `module/at`', context);
    const name = expectString(input(inputs, 1), 'the name of `module/at`', context);
    const member = module.members.get(name);
    if (member === undefined) throw runtimeError(`module \`${module.name}\` has no exported name ${formatValue(input(inputs, 1), 'show')}`, context.position);
    return member;
  });

  interpreter.defineIn('module', 'has', 2, (inputs, context) => {
    const module = expectModule(input(inputs, 0), 'the input of `module/has`', context);
    return boolean(module.members.has(expectString(input(inputs, 1), 'the name of `module/has`', context)));
  });

  interpreter.defineIn('module', 'names', 1, (inputs, context) => {
    const module = expectModule(input(inputs, 0), 'the input of `module/names`', context);
    return array([...module.members.keys()].map(string));
  });

  interpreter.defineIn('module', 'path', 1, (inputs, context) => string(displayPath(expectModule(input(inputs, 0), 'the input of `module/path`', context).path)));

}
