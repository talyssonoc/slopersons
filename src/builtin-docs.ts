export interface BuiltinDoc {
  usage: string;
  summary: string;
}

export type BuiltinDocs = Record<string, BuiltinDoc>;

const DOCUMENTATION_EXTENSION = '.md';
const CODE_SPAN = /`([^`]+)`/g;

function paragraphAt(lines: string[], start: number): { text: string; end: number } {
  let index = start;
  while (index < lines.length && (lines[index] ?? '').trim() === '') index++;
  const paragraph: string[] = [];
  while (index < lines.length) {
    const line = lines[index] ?? '';
    if (line.trim() === '' || line.startsWith('```') || line.startsWith('#')) break;
    paragraph.push(line.trim());
    index++;
  }
  return { text: paragraph.join(' '), end: index };
}

function mentions(span: string, name: string): boolean {
  return new RegExp(`(^|[\\s(])${name.replace(/[/-]/g, '\\$&')}($|[\\s)])`).test(span);
}

// A heading that groups builtins may show the usage of only the first (`datetime -> datetime/year` and so
// on); the others take that usage with their own name.
function usageFor(usageLine: string, name: string, group: string[]): string {
  const spans = [...usageLine.matchAll(CODE_SPAN)].map((match) => match[1] ?? '');
  const own = spans.find((span) => mentions(span, name));
  if (own !== undefined) return own;
  for (const sibling of group) {
    const span = spans.find((candidate) => mentions(candidate, sibling));
    if (span !== undefined) return span.replace(sibling, name);
  }
  return spans[0] ?? '';
}

// Each page of docs/stdlib documents one module, core.md the bare builtins. A section is a `##` heading
// naming one or more builtins, a line with their usage in backticks, and a paragraph describing them.
export function parseBuiltinDocs(files: Record<string, string>): BuiltinDocs {
  const docs: BuiltinDocs = {};
  for (const [fileName, text] of Object.entries(files)) {
    if (!fileName.endsWith(DOCUMENTATION_EXTENSION)) continue;
    const module = fileName.slice(0, -DOCUMENTATION_EXTENSION.length);
    const lines = text.split('\n');
    const title = lines.findIndex((line) => line.startsWith('# '));
    if (module !== 'core' && title !== -1) docs[module] = { usage: '', summary: paragraphAt(lines, title + 1).text };
    lines.forEach((line, index) => {
      if (!line.startsWith('## ')) return;
      const usage = paragraphAt(lines, index + 1);
      const summary = paragraphAt(lines, usage.end).text;
      const group = line
        .slice(3)
        .split(',')
        .map((item) => item.trim().replace(/`/g, ''))
        .map((name) => (name.includes('/') || module === 'core' ? name : `${module}/${name}`));
      for (const qualified of group) docs[qualified] = { usage: usageFor(usage.text, qualified, group), summary };
    });
  }
  return docs;
}
