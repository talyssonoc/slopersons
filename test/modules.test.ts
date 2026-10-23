import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { runProgram } from '../src/cli.ts';
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

const geometry = 'proc area r | 3 * r * r\nproc helper | "hidden"\n"geometry loaded" -> print-ln\nexport area\n';

test('use loads a module once, binds it, and exposes only exported names', () => {
  const result = project({ 'geometry.slop': geometry }, '"./geometry" -> use => geo\n5 -> geo/area -> print-ln\n"./geometry" -> use => again\n(again = geo) -> print-ln\ngeo -> names -> print-ln\ngeo -> has "area" -> print-ln\ngeo -> has "helper" -> print-ln\ngeo -> print-ln\ngeo -> type-of -> print-ln\n');
  assert.equal(result.err, '');
  assert.equal(result.out, 'geometry loaded\n75\nyes\n["area"]\nyes\nno\n<module geometry>\nmodule\n');
  assert.equal(result.code, 0);
});

test('a member can be bound into scope, read with at, or reported as missing', () => {
  const result = project({ 'geometry.slop': geometry }, '"./geometry" -> use => geo\ngeo/area => area\n2 -> area -> print-ln\n2 -> (geo -> at "area") -> print-ln\nattempt | geo/helper recover e | e -> print-ln\nattempt | geo -> at "helper" recover e | e -> print-ln\nattempt | 5 -> geo/area/deeper recover e | e -> print-ln\n');
  assert.equal(result.out, 'geometry loaded\n12\n12\nmodule `geo` has no exported name `helper`\nmodule `geometry` has no exported name "helper"\n`geo/area` is a proc, not a module, so `geo/area/deeper` cannot be looked up\n');
});

test('the .slop extension is optional and paths resolve relative to the importing file', () => {
  const files = {
    'lib/geometry.slop': '"./helpers" -> use => helpers\nproc area r | r -> helpers/triple\nexport area\n',
    'lib/helpers.slop': 'proc triple n | n * 3\nexport triple\n',
  };
  const result = project(files, '"./lib/geometry.slop" -> use => geo\n4 -> geo/area -> print-ln\n');
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
  const result = project({}, 'attempt | "./missing" -> use recover e | "recovered: {e -> message}" -> print-ln\n');
  assert.match(result.out, /^recovered: cannot read module "\.\/missing" \(looked for .*missing\.slop\)\n$/);
});

test('errors raised inside a module point at the module file, and its parse errors are not catchable', () => {
  const failing = project({ 'bad.slop': 'proc boom\n| 1 / 0\nexport boom\n' }, '"./bad" -> use => bad\nboom -> print-ln\nbad/boom -> do\n');
  assert.equal(failing.out, '');
  assert.match(failing.err, /^error: unknown name `boom`\n  at .*main\.slop:2:1\n$/);
  const inner = project({ 'bad.slop': 'proc boom\n| 1 / 0\nexport boom\n' }, '"./bad" -> use => bad\nattempt | bad/boom -> do recover e | "{e -> message} in {e -> file} line {e -> line}" -> print-ln\n');
  assert.match(inner.out, /^division by zero in .*bad\.slop line 2\n$/);
  const unparsable = project({ 'syntax.slop': 'x -1\n' }, 'attempt | "./syntax" -> use recover | "caught" -> print-ln\n');
  assert.equal(unparsable.out, '');
  assert.match(unparsable.err, /^error: unexpected `-`; binary operators need spaces on both sides\n  at .*syntax\.slop:1:3\n$/);
  assert.equal(unparsable.code, 1);
});

test('export in the main program is allowed and ignored, and a module without exports is empty', () => {
  const result = project({ 'empty.slop': '"side effect" -> print-ln\n' }, 'export whatever\n"./empty" -> use -> names -> print-ln\n');
  assert.equal(result.out, 'side effect\n[]\n');
});
