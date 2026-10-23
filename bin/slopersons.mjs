#!/usr/bin/env node
import { main } from '../src/cli.ts';

try {
  process.exitCode = await main(process.argv.slice(2));
} catch {
  process.stderr.write('error: internal interpreter error; this is a bug in slopersons, not in your program\n');
  process.exitCode = 70;
}
