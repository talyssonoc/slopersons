import { parentPort, workerData } from 'node:worker_threads';
import { EXIT_INTERNAL, INTERNAL_ERROR_LINE, LINE_ENDED, LINE_WAITING, lineInput, type ReplIo } from './boundary.ts';
import { createInterpreter, nodeIo, runProgram, type WorkerData } from './cli.ts';
import { Repl } from './repl.ts';

process.removeAllListeners('warning');
process.on('warning', () => {});

function replIo(control: SharedArrayBuffer, data: SharedArrayBuffer): ReplIo {
  const controlView = new Int32Array(control);
  const dataView = new Uint8Array(data);
  const decoder = new TextDecoder();
  const readLine = (prompt: string): string | null => {
    Atomics.store(controlView, 0, LINE_WAITING);
    parentPort?.postMessage({ type: 'read-line', prompt });
    Atomics.wait(controlView, 0, LINE_WAITING);
    if (Atomics.load(controlView, 0) === LINE_ENDED) return null;
    const length = Atomics.load(controlView, 1);
    return decoder.decode(dataView.slice(0, length));
  };
  return {
    write: nodeIo.write,
    writeError: nodeIo.writeError,
    readLine,
    readInput: lineInput(() => readLine('')),
  };
}

const given = workerData as WorkerData;
let code = EXIT_INTERNAL;
try {
  if (given.mode === 'repl') {
    const io = replIo(given.control, given.data);
    code = new Repl(io, createInterpreter(io)).run();
  } else {
    code = runProgram(given.source, given.file, nodeIo, createInterpreter(nodeIo, given.programArguments));
  }
} catch {
  nodeIo.writeError(INTERNAL_ERROR_LINE);
}
parentPort?.postMessage(code);
