import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createInterpreter, runProgram } from '../src/cli.ts';
import { registerSourceModule, standardSourceModule } from '../src/modules.ts';
import { fakeIo } from './helpers/run.ts';

function project(files: Record<string, string>, main: string): { out: string; err: string; code: number; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'slopersons-modules-'));
  for (const [name, source] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, name)), { recursive: true });
    writeFileSync(join(dir, name), source);
  }
  const io = fakeIo();
  const code = runProgram(main, join(dir, 'main.slop'), io);
  return { out: io.out, err: io.error, code, dir };
}

const geometry = 'proc area r | 3 * r * r\nproc helper | "hidden"\n"geometry loaded" -> io/print-line\nexport area\n';

test('use loads a module once, binds it, and exposes only exported names', () => {
  const result = project({ 'geometry.slop': geometry }, '"./geometry" -> use => geo\n5 -> geo/area -> io/print-line\n"./geometry" -> use => again\n(again = geo) -> io/print-line\ngeo -> module/names -> io/print-line\ngeo -> module/has "area" -> io/print-line\ngeo -> module/has "helper" -> io/print-line\ngeo -> io/print-line\ngeo -> type-of -> io/print-line\n');
  assert.equal(result.err, '');
  assert.equal(result.out, 'geometry loaded\n75\nyes\n["area"]\nyes\nno\n<module geometry>\nmodule\n');
  assert.equal(result.code, 0);
});

test('a member can be bound into scope, read with at, or reported as missing', () => {
  const result = project({ 'geometry.slop': geometry }, '"./geometry" -> use => geo\ngeo/area => area\n2 -> area -> io/print-line\n2 -> (geo -> module/at "area") -> io/print-line\nattempt | geo/helper recover e | e -> io/print-line\nattempt | geo -> module/at "helper" recover e | e -> io/print-line\nattempt | 5 -> geo/area/deeper recover e | e -> io/print-line\n');
  assert.equal(result.out, 'geometry loaded\n12\n12\nmodule `geo` has no exported name `helper`\nmodule `geometry` has no exported name "helper"\n`geo/area` is a proc, not a module, so `geo/area/deeper` cannot be looked up\n');
});

test('the .slop extension is optional and paths resolve relative to the importing file', () => {
  const files = {
    'lib/geometry.slop': '"./helpers" -> use => helpers\nproc area r | r -> helpers/triple\nexport area\n',
    'lib/helpers.slop': 'proc triple n | n * 3\nexport triple\n',
  };
  const result = project(files, '"./lib/geometry.slop" -> use => geo\n4 -> geo/area -> io/print-line\n');
  assert.equal(result.err, '');
  assert.equal(result.out, '12\n');
});

test('exporting a name the module never binds is an error at the export statement', () => {
  const result = project({ 'broken.slop': 'export area\nproc other | 1\n' }, '"./broken" -> use\n');
  assert.match(result.err, /^error: `export` names `area`, which .*broken\.slop does not bind\n  at .*broken\.slop:1:1\n$/);
  assert.equal(result.code, 1);
});

test('circular imports are reported with the chain', () => {
  const files = { 'a.slop': '"./b" -> use\nexport nothing-here\n', 'b.slop': '"./a" -> use\n' };
  const result = project(files, '"./a" -> use\n');
  assert.match(result.err, /^error: circular import: .*a\.slop -> .*b\.slop -> .*a\.slop\n  at .*b\.slop:1:7\n$/);
});

test('a missing module is a runtime error that attempt can recover from', () => {
  const result = project({}, 'attempt | "./missing" -> use recover e | "recovered: {e -> error/message}" -> io/print-line\n');
  assert.match(result.out, /^recovered: cannot read module "\.\/missing" \(looked for .*missing\.slop\)\n$/);
});

test('errors raised inside a module point at the module file, and its parse errors are not catchable', () => {
  const failing = project({ 'bad.slop': 'proc boom\n| 1 / 0\nexport boom\n' }, '"./bad" -> use => bad\nboom -> io/print-line\nbad/boom -> do\n');
  assert.equal(failing.out, '');
  assert.match(failing.err, /^error: unknown name `boom`\n  at .*main\.slop:2:1\n$/);
  const inner = project({ 'bad.slop': 'proc boom\n| 1 / 0\nexport boom\n' }, '"./bad" -> use => bad\nattempt | bad/boom -> do recover e | "{e -> error/message} in {e -> error/file} line {e -> error/line}" -> io/print-line\n');
  assert.match(inner.out, /^division by zero in .*bad\.slop line 2\n$/);
  const unparsable = project({ 'syntax.slop': 'x -1\n' }, 'attempt | "./syntax" -> use recover | "caught" -> io/print-line\n');
  assert.equal(unparsable.out, '');
  assert.match(unparsable.err, /^error: unexpected `-`; binary operators need spaces on both sides\n  at .*syntax\.slop:1:3\n$/);
  assert.equal(unparsable.code, 1);
});

test('export in the main program is allowed and ignored, and a module without exports is empty', () => {
  const result = project({ 'empty.slop': '"side effect" -> io/print-line\n' }, 'export whatever\n"./empty" -> use -> module/names -> io/print-line\n');
  assert.equal(result.out, 'side effect\n[]\n');
});

test('a source module becomes a builtin module: exports become members, and errors raised inside it point at the caller', () => {
  const directory = mkdtempSync(join(tmpdir(), 'slopersons-source-'));
  const path = join(directory, 'tool.slop');
  writeFileSync(path, 'proc helper | "hidden"\nproc broken | 1 / 0\nproc apply x f | x -> f\n42 => answer\nexport broken apply answer\n');
  const io = fakeIo();
  const interpreter = createInterpreter(io);
  registerSourceModule(interpreter, 'tool', readFileSync(path, 'utf8'));
  const source = 'tool -> module/names -> io/print-line\ntool/answer -> io/print-line\ntool/apply -> io/print-line\n"x" -> tool/apply (s | s + "!") -> io/print-line\nattempt | tool/broken -> do recover e | "{e -> error/line}:{e -> error/column}" -> io/print-line\n"y" -> tool/apply (n | n / 0)\n';
  const code = runProgram(source, 'main.slop', io, interpreter);
  assert.equal(io.out, '["broken" "apply" "answer"]\n42\n<proc tool/apply>\nx!\n5:23\n');
  assert.equal(io.error, 'error: cannot divide a string and an int\n  at main.slop:6:26\n');
  assert.equal(code, 1);
});

test('an error a source module raises with details keeps them when it is moved to the caller', () => {
  const io = fakeIo();
  const interpreter = createInterpreter(io);
  registerSourceModule(interpreter, 'tool', 'proc refuse | "no" -> fail {"kind": "refused"}\nexport refuse\n');
  const code = runProgram('attempt | tool/refuse -> do recover e | "{e -> error/line}: {e -> error/details}" -> io/print-line\n', 'main.slop', io, interpreter);
  assert.equal(io.out, '1: {"kind": "refused"}\n');
  assert.equal(code, 0);
});

test('a source module that exports a name it never binds fails at startup', () => {
  const directory = mkdtempSync(join(tmpdir(), 'slopersons-source-'));
  const path = join(directory, 'empty.slop');
  writeFileSync(path, 'export missing\n');
  assert.throws(() => registerSourceModule(createInterpreter(fakeIo()), 'empty', readFileSync(path, 'utf8')), /the builtin module `empty` exports `missing`, which it does not bind/);
});

test('a source module may define at-end, which runs when the program ends and sets the exit code of a program that succeeded', () => {
  const directory = mkdtempSync(join(tmpdir(), 'slopersons-source-'));
  const path = join(directory, 'counter.slop');
  writeFileSync(path, '0 => calls\nproc bump | calls + 1 =>> calls\nproc at-end\n| "bumped {calls} times" -> io/print-line\n| calls\nexport bump\n');
  const run = (source: string): { out: string; err: string; code: number } => {
    const io = fakeIo();
    const interpreter = createInterpreter(io);
    registerSourceModule(interpreter, 'counter', readFileSync(path, 'utf8'));
    const code = runProgram(source, 'main.slop', io, interpreter);
    return { out: io.out, err: io.error, code };
  };
  assert.deepEqual(run('counter/bump -> do\ncounter/bump -> do\n"done" -> io/print-line'), { out: 'done\nbumped 2 times\n', err: '', code: 2 });
  assert.deepEqual(run('"nothing to do" -> io/print-line'), { out: 'nothing to do\nbumped 0 times\n', err: '', code: 0 });
  assert.deepEqual(run('counter/bump -> do\n1 / 0'), { out: 'bumped 1 times\n', err: 'error: division by zero\n  at main.slop:2:3\n', code: 1 });
  assert.equal(run('counter -> module/has "at-end" -> io/print-line').out, 'no\nbumped 0 times\n');
});

test('an at-end that takes inputs fails at startup', () => {
  const directory = mkdtempSync(join(tmpdir(), 'slopersons-source-'));
  const path = join(directory, 'broken.slop');
  writeFileSync(path, 'proc at-end code | code\n');
  assert.throws(() => registerSourceModule(createInterpreter(fakeIo()), 'broken', readFileSync(path, 'utf8')), /defines `at-end`, which must be a procedure with no inputs/);
});

test('in a checkout, the standard library source modules are read from src/stdlib', () => {
  assert.equal(standardSourceModule('json'), readFileSync(new URL('../src/stdlib/json.slop', import.meta.url), 'utf8'));
  assert.equal(standardSourceModule('test'), readFileSync(new URL('../src/stdlib/test.slop', import.meta.url), 'utf8'));
});
