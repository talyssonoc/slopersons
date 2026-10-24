import { codePoints, endsWith, startsWith } from './text.ts';

const SEPARATOR = '/';

export function joinPaths(base: string, parts: readonly string[]): string {
  let joined = base;
  for (const part of parts) {
    if (startsWith(part, SEPARATOR)) joined = part;
    else if (joined === '' || endsWith(joined, SEPARATOR)) joined += part;
    else joined += SEPARATOR + part;
  }
  return joined;
}

export function parentPath(path: string): string {
  const characters = codePoints(path);
  if (characters.length === 0) return '.';
  const rooted = characters[0] === SEPARATOR;
  let end = -1;
  let inLastName = false;
  for (let i = characters.length - 1; i >= 1; i--) {
    if (characters[i] !== SEPARATOR) {
      inLastName = true;
    } else if (inLastName) {
      end = i;
      break;
    }
  }
  if (end === -1) return rooted ? SEPARATOR : '.';
  if (rooted && end === 1) return '//';
  return characters.slice(0, end).join('');
}
