import { runtimeError } from '../errors.ts';
import { ExitSignal, OutSignal, StopSignal, type CallContext, type Interpreter } from '../interpreter.ts';
import { NOTHING, array, describeType, formatValue, int, str, typeName, type Value } from '../values.ts';

export const MAX_SIZE = 50_000_000n;

export function checkSize(size: bigint, name: string, unit: string, ctx: CallContext): number {
  if (size > MAX_SIZE) {
    throw runtimeError(`\`${name}\` would build a value of ${size} ${unit}, which is more than the limit of ${MAX_SIZE}`, ctx.pos);
  }
  return Number(size);
}

export function arg(args: Value[], index: number): Value {
  return args[index] ?? NOTHING;
}

export function expectChar(value: Value, what: string, ctx: CallContext): string {
  if (value.t !== 'char') throw runtimeError(`${what} must be a char, got ${describeType(value)}`, ctx.pos);
  return value.v;
}

export function expectDecision(value: Value, what: string, ctx: CallContext): boolean {
  if (value.t !== 'bool') throw runtimeError(`${what} must return \`yes\` or \`no\`, got ${describeType(value)}`, ctx.pos);
  return value.v;
}

export function expectInt(value: Value, what: string, ctx: CallContext): bigint {
  if (value.t !== 'int') throw runtimeError(`${what} must be an int, got ${describeType(value)}`, ctx.pos);
  return value.v;
}

export function expectString(value: Value, what: string, ctx: CallContext): string {
  if (value.t !== 'string') throw runtimeError(`${what} must be a string, got ${describeType(value)}`, ctx.pos);
  return value.v;
}

export function expectProc(value: Value, what: string, ctx: CallContext): Value {
  if (value.t !== 'proc' && value.t !== 'builtin') throw runtimeError(`${what} must be a procedure, got ${describeType(value)}`, ctx.pos);
  return value;
}

export function expectArray(value: Value, what: string, ctx: CallContext): Value[] {
  if (value.t !== 'array') throw runtimeError(`${what} must be an array, got ${describeType(value)}`, ctx.pos);
  return value.items;
}

export function toIndex(value: Value, what: string, ctx: CallContext): number {
  const big = expectInt(value, what, ctx);
  if (big < 0n || big > BigInt(Number.MAX_SAFE_INTEGER)) throw runtimeError(`${what} is out of range: ${big}`, ctx.pos);
  return Number(big);
}

export function callLambda(fn: Value, args: Value[], ctx: CallContext): Value {
  return ctx.interp.callValue(fn, args, ctx.pos, ctx.env);
}

export function callWithOptionalArg(fn: Value, arg: Value, ctx: CallContext): Value {
  if (fn.t === 'proc' && fn.params.length === 0) return callLambda(fn, [], ctx);
  return callLambda(fn, [arg], ctx);
}

export function runLoopBody(body: () => void): boolean {
  try {
    body();
    return true;
  } catch (signal) {
    if (signal instanceof StopSignal) return false;
    throw signal;
  }
}

export function registerCore(interp: Interpreter): void {
  interp.defineBuiltin('print-ln', 1, (args, ctx) => {
    ctx.interp.io.write(`${formatValue(arg(args, 0), 'print')}\n`);
    return arg(args, 0);
  });

  interp.defineBuiltin('print', 1, (args, ctx) => {
    ctx.interp.io.write(formatValue(arg(args, 0), 'print'));
    return arg(args, 0);
  });

  interp.defineBuiltin('show', 1, (args) => str(formatValue(arg(args, 0), 'show')));

  interp.defineBuiltin('type-of', 1, (args) => str(typeName(arg(args, 0))));

  interp.defineBuiltin('do', { min: 1, max: null }, (args, ctx) => {
    const fn = expectProc(arg(args, 0), 'the input of `do`', ctx);
    return callLambda(fn, args.slice(1), ctx);
  });

  interp.defineBuiltin('out', 1, (args, ctx) => {
    throw new OutSignal(ctx.env.activation, arg(args, 0), ctx.pos);
  });

  interp.defineBuiltin('fail', 1, (args, ctx) => {
    throw runtimeError(expectString(arg(args, 0), 'the message of `fail`', ctx), ctx.pos);
  });

  interp.defineBuiltin('exit', 1, (args, ctx) => {
    const code = expectInt(arg(args, 0), 'the exit code', ctx);
    if (code < 0n || code > 255n) throw runtimeError(`the exit code must be between 0 and 255, got ${code}`, ctx.pos);
    throw new ExitSignal(Number(code));
  });

  interp.defineBuiltin('read-line', 0, (_args, ctx) => {
    const line = ctx.interp.io.readLine();
    return line === null ? NOTHING : str(line);
  });

  interp.defineBuiltin('to', 2, (args, ctx) => {
    const from = expectInt(arg(args, 0), 'the start of `to`', ctx);
    const to = expectInt(arg(args, 1), 'the end of `to`', ctx);
    if (to >= from) checkSize(to - from + 1n, 'to', 'elements', ctx);
    const items: Value[] = [];
    for (let i = from; i <= to; i++) items.push(int(i));
    return array(items);
  });

  interp.defineMethod('each', 'array', 2, (args, ctx) => {
    const items = expectArray(arg(args, 0), 'the input of `each`', ctx);
    const fn = expectProc(arg(args, 1), 'the body of `each`', ctx);
    for (const item of items.slice()) {
      if (!runLoopBody(() => callLambda(fn, [item], ctx))) break;
    }
    return NOTHING;
  });

  interp.defineMethod('repeat', 'int', 2, (args, ctx) => {
    const times = expectInt(arg(args, 0), 'the count of `repeat`', ctx);
    const fn = expectProc(arg(args, 1), 'the body of `repeat`', ctx);
    for (let i = 0n; i < times; i++) {
      if (!runLoopBody(() => callWithOptionalArg(fn, int(i), ctx))) break;
    }
    return NOTHING;
  });
}
