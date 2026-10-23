import { parentPort, workerData } from 'node:worker_threads';
import { EXIT_INTERNAL, nodeIo, runProgram } from './cli.ts';

process.removeAllListeners('warning');
process.on('warning', () => {});

const data = workerData as { source: string; file: string };
let code = EXIT_INTERNAL;
try {
  code = runProgram(data.source, data.file, nodeIo);
} catch {
  nodeIo.writeError('error: internal interpreter error; this is a bug in slopersons, not in your program\n');
}
parentPort?.postMessage(code);
