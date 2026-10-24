import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('..', import.meta.url));
const stdlibDirectory = join(root, 'src', 'stdlib');
const SOURCE_EXTENSION = '.slop';

function sourceModules(): Record<string, string> {
  const modules: Record<string, string> = {};
  for (const name of readdirSync(stdlibDirectory)) {
    if (name.endsWith(SOURCE_EXTENSION)) modules[name.slice(0, -SOURCE_EXTENSION.length)] = readFileSync(join(stdlibDirectory, name), 'utf8');
  }
  return modules;
}

export async function bundle(outputDirectory: string): Promise<string> {
  const embeddedSources = JSON.stringify(sourceModules());
  const worker = await build({
    entryPoints: [join(root, 'src', 'worker.ts')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node26',
    write: false,
    define: { SLOPERSONS_SOURCE_MODULES: embeddedSources },
    logLevel: 'warning',
    logOverride: { 'empty-import-meta': 'silent' },
  });
  const workerSource = worker.outputFiles[0]?.text;
  if (workerSource === undefined) throw new Error('esbuild produced no bundle for the worker');
  const mainFile = join(outputDirectory, 'slopersons.mjs');
  await build({
    entryPoints: [join(root, 'bin', 'slopersons.mjs')],
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node26',
    outfile: mainFile,
    define: { SLOPERSONS_SOURCE_MODULES: embeddedSources, SLOPERSONS_WORKER_SOURCE: JSON.stringify(workerSource) },
    logLevel: 'warning',
  });
  return mainFile;
}

function runStep(command: string, inputs: string[]): void {
  const result = spawnSync(command, inputs, { stdio: 'inherit' });
  if (result.error !== undefined) throw new Error(`could not run ${command}: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`${command} ${inputs.join(' ')} exited with ${result.status}`);
}

export async function buildExecutable(output: string): Promise<string> {
  const executable = resolve(output);
  const workDirectory = join(dirname(executable), 'sea');
  mkdirSync(workDirectory, { recursive: true });
  const main = await bundle(workDirectory);
  const configuration = join(workDirectory, 'sea-config.json');
  writeFileSync(configuration, `${JSON.stringify({ main, mainFormat: 'module', output: executable, disableExperimentalSEAWarning: true }, null, 2)}\n`);
  runStep(process.execPath, ['--build-sea', configuration]);
  if (process.platform === 'darwin') runStep('codesign', ['--sign', '-', executable]);
  return executable;
}

if (import.meta.main) {
  try {
    const executable = await buildExecutable(join(root, 'dist', 'slopersons'));
    process.stdout.write(`built ${relative(process.cwd(), executable)}\n`);
  } catch (error) {
    process.stderr.write(`build failed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
