import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { PLUGIN_ROOT } from '../../src/shared/env/paths.ts';
import { listFiles } from '../helpers/architecture.ts';

const read = (path: string): string => readFileSync(join(PLUGIN_ROOT, path), 'utf8');
const lineCount = (path: string): number => read(path).split('\n').length;
const optional = (dir: string): string[] =>
  existsSync(join(PLUGIN_ROOT, dir)) ? listFiles(PLUGIN_ROOT, dir) : [];

const skills = [
  ...(existsSync(join(PLUGIN_ROOT, 'SKILL.md')) ? ['SKILL.md'] : []),
  ...optional('skills').filter((path) => path.endsWith('SKILL.md')),
];
const references = optional('reference').filter((path) => path.endsWith('.md'));
const agentDocs = ['AGENTS.md', ...skills, ...references];

test('line budgets', () => {
  const over: string[] = [];
  if (lineCount('AGENTS.md') > 80) over.push('AGENTS.md is over 80 lines');
  for (const path of skills) if (lineCount(path) > 150) over.push(`${path} is over 150 lines`);
  for (const path of references) {
    const lines = lineCount(path);
    if (lines > 150) over.push(`${path} is over 150 lines`);
    const head = read(path).split('\n').slice(0, 15).join('\n');
    if (lines > 100 && !/^## Contents$/m.test(head)) {
      over.push(`${path} needs "## Contents" near the top`);
    }
  }
  assert.deepEqual(over, []);
});

test('paths and npm scripts named in agent docs exist', () => {
  const scripts = (JSON.parse(read('package.json')) as { scripts: Record<string, string> }).scripts;
  const pathInTicks =
    /`((?:src|test|docs|bin|scripts|skills|agents|reference|locales|hooks)\/[^`\s<>*{}]+)`/g;
  const missing: string[] = [];
  for (const doc of agentDocs) {
    const text = read(doc);
    for (const match of text.matchAll(pathInTicks)) {
      const path = match[1] ?? '';
      if (!existsSync(join(PLUGIN_ROOT, path))) missing.push(`${doc}: ${path}`);
    }
    for (const match of text.matchAll(/npm run ([a-z:]+)/g)) {
      const name = match[1] ?? '';
      if (!(name in scripts)) missing.push(`${doc}: npm run ${name}`);
    }
  }
  assert.deepEqual(missing, []);
});

test('CLAUDE.md imports AGENTS.md', () => {
  assert.match(read('.claude/CLAUDE.md'), /^@\.\.\/AGENTS\.md$/m);
});
