import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));

function slopFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return slopFiles(path);
    return entry.name.endsWith('.slop') ? [path] : [];
  });
}

export function repositoryPrograms(): string[] {
  return ['docs/examples', 'test/programs', 'src/stdlib'].flatMap((directory) => slopFiles(join(root, directory)));
}
