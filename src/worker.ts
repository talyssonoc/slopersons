import { parentPort, workerData } from 'node:worker_threads';
import { EXIT_INTERNAL, INTERNAL_ERROR_LINE } from './boundary.ts';
import { createInterpreter, nodeIo, runProgram, type WorkerData } from './cli.ts';
import { Repl } from './repl.ts';

process.removeAllListeners('warning');
process.on('warning', () => {});

const data = workerData as WorkerData;
let code = EXIT_INTERNAL;
try {
  code = data.mode === 'repl' ? new Repl(nodeIo, createInterpreter(nodeIo)).run() : runProgram(data.source, data.file, nodeIo);
} catch {
  nodeIo.writeError(INTERNAL_ERROR_LINE);
}
parentPort?.postMessage(code);
