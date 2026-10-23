import type { Statement } from './ast.ts';
import { BrokenPipe, EXIT_OK, INTERNAL_ERROR_LINE, describeUnexpected, type CliIo } from './boundary.ts';
import { SlopersonsError } from './errors.ts';
import { ExitSignal, type Environment, type Interpreter } from './interpreter.ts';
import { parse } from './parser.ts';
import { formatValue } from './values.ts';

export const PROMPT = '> ';
export const CONTINUATION_PROMPT = '.. ';
export const REPL_FILE = '<repl>';
export const BANNER = 'slopersons, Ctrl-D to leave\n';

type Reading = 'complete' | 'incomplete' | 'wants-block' | 'error';

export class Repl {
  private readonly io: CliIo;
  private readonly interpreter: Interpreter;
  private readonly environment: Environment;

  constructor(io: CliIo, interpreter: Interpreter) {
    this.io = io;
    this.interpreter = interpreter;
    this.environment = interpreter.createTopLevelEnvironment();
  }

  run(): number {
    this.io.write(BANNER);
    const pending: string[] = [];
    while (true) {
      const line = this.io.readLine(pending.length === 0 ? PROMPT : CONTINUATION_PROMPT);
      if (line === null) {
        this.io.write('\n');
        if (pending.length === 0) return EXIT_OK;
        return this.execute(pending.join('\n')) ?? EXIT_OK;
      }
      if (pending.length === 0) {
        if (line.trim() === '') continue;
        const reading = this.classify(line);
        if (reading === 'incomplete' || reading === 'wants-block') {
          pending.push(line);
          continue;
        }
        const code = this.execute(line);
        if (code !== null) return code;
        continue;
      }
      if (line.trim() !== '') {
        pending.push(line);
        continue;
      }
      const source = pending.join('\n');
      pending.length = 0;
      const code = this.execute(source);
      if (code !== null) return code;
    }
  }

  private classify(line: string): Reading {
    try {
      return this.wantsBlock(parse(line)) ? 'wants-block' : 'complete';
    } catch (error) {
      return error instanceof SlopersonsError && error.incomplete ? 'incomplete' : 'error';
    }
  }

  private wantsBlock(program: Statement[]): boolean {
    const last = program[program.length - 1];
    if (last === undefined || last.kind !== 'flow-statement' || last.expression.kind !== 'flow') return false;
    const step = last.expression.steps[last.expression.steps.length - 1];
    if (step === undefined || step.kind !== 'call' || step.body !== null) return false;
    for (let index = step.arguments.length - 1; index >= 0; index--) {
      const argument = step.arguments[index];
      if (argument === undefined || argument.kind !== 'name') return false;
      if (this.environment.lookup(argument.name) === undefined && this.interpreter.builtin(argument.name) === undefined) return true;
    }
    return false;
  }

  private execute(source: string): number | null {
    try {
      const value = this.interpreter.runIn(parse(source), this.environment);
      if (value.type !== 'nothing') this.io.write(`-> ${formatValue(value, 'show')}\n`);
      return null;
    } catch (error) {
      if (error instanceof ExitSignal) return error.code;
      if (error instanceof BrokenPipe) return EXIT_OK;
      if (error instanceof SlopersonsError) {
        this.io.writeError(`${error.withFile(REPL_FILE).format()}\n`);
        return null;
      }
      this.io.writeError(describeUnexpected(error) ?? INTERNAL_ERROR_LINE);
      return null;
    }
  }
}
