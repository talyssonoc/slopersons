import { parentPort, workerData } from 'node:worker_threads';
import { EXIT_INTERNAL, INTERNAL_ERROR_LINE, LINE_ENDED, LINE_INTERRUPTED, LINE_WAITING, lineInput, type ReplIo } from './boundary.ts';
import { INTERRUPT_HANDLED, bridgedHost } from './bridge.ts';
import { createInterpreter, nodeOutput, runProgram, type WorkerData } from './cli.ts';
import { EXIT_INTERRUPTED, ExitSignal, type Io } from './interpreter.ts';
import { Repl } from './repl.ts';

process.removeAllListeners('warning');
process.on('warning', () => {});

function replIo(control: SharedArrayBuffer, data: SharedArrayBuffer, interrupt: SharedArrayBuffer): ReplIo {
  const controlView = new Int32Array(control);
  const dataView = new Uint8Array(data);
  const interruptView = new Int32Array(interrupt);
  const decoder = new TextDecoder();
  const readLine = (prompt: string): string | null => {
    Atomics.store(controlView, 0, LINE_WAITING);
    parentPort?.postMessage({ type: 'read-line', prompt });
    Atomics.wait(controlView, 0, LINE_WAITING);
    const state = Atomics.load(controlView, 0);
    if (state === LINE_INTERRUPTED) {
      Atomics.store(interruptView, 0, INTERRUPT_HANDLED);
      throw new ExitSignal(EXIT_INTERRUPTED);
    }
    if (state === LINE_ENDED) return null;
    const length = Atomics.load(controlView, 1);
    return decoder.decode(dataView.slice(0, length));
  };
  return {
    ...nodeOutput,
    readLine,
    readInput: lineInput(() => readLine('')),
  };
}

const given = workerData as WorkerData;
const host = bridgedHost(given.bridge);
let code = EXIT_INTERNAL;
try {
  if (given.mode === 'repl') {
    const io = replIo(given.control, given.data, given.bridge.interrupt);
    code = new Repl(io, createInterpreter(io, { network: host.network, interruption: host.interruption })).run();
  } else {
    const io: Io = { ...nodeOutput, readInput: host.readInput };
    code = runProgram(given.source, given.file, io, createInterpreter(io, { programArguments: given.programArguments, network: host.network, interruption: host.interruption }));
  }
} catch {
  nodeOutput.writeError(INTERNAL_ERROR_LINE);
}
parentPort?.postMessage(code);
