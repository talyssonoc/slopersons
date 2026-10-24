import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = fileURLToPath(new URL('../docs/adr', import.meta.url));
const records = readdirSync(directory).filter((name) => /^\d{12}-.+\.md$/.test(name));

const AUTHORITY_INSTEAD_OF_REASONS = [
  /\bproject owner\b/i,
  /\bthe owner\b/i,
  /\bowner's\b/i,
  /\bthe (?:user|client|stakeholders?|team) (?:asked|wanted|wants|chose|decided|said|agreed|requested|preferred)\b/i,
  /\bthe brief\b/i,
  /\bthe implementer\b/i,
  /\b(?:was|were) put to\b/i,
];

test('the decision log has records', () => {
  assert.ok(records.length > 0);
});

for (const name of records) {
  const text = readFileSync(join(directory, name), 'utf8');

  test(`${name} has the Status, Context, Decision and Consequences sections`, () => {
    for (const section of ['## Status', '## Context', '## Decision', '## Consequences']) assert.match(text, new RegExp(`^${section}$`, 'm'), `missing ${section}`);
  });

  test(`${name} gives reasons, not who asked`, () => {
    const offenders = text.split('\n').flatMap((line, index) => (AUTHORITY_INSTEAD_OF_REASONS.some((pattern) => pattern.test(line)) ? [`line ${index + 1}: ${line}`] : []));
    assert.deepEqual(offenders, [], 'state the force or the reason behind the decision instead (see "How to write one" in docs/adr/README.md)');
  });
}
