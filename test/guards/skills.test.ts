import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { PLUGIN_ROOT } from '../../src/shared/env/paths.ts';
import { listFiles } from '../helpers/architecture.ts';

const read = (path: string): string => readFileSync(join(PLUGIN_ROOT, path), 'utf8');
const optional = (dir: string): string[] =>
  existsSync(join(PLUGIN_ROOT, dir)) ? listFiles(PLUGIN_ROOT, dir) : [];

const skills = [
  ...(existsSync(join(PLUGIN_ROOT, 'SKILL.md')) ? ['SKILL.md'] : []),
  ...optional('skills').filter((path) => path.endsWith('SKILL.md')),
];
const agents = optional('agents').filter((path) => path.endsWith('.md'));

/** The `key: value` lines between the first two `---` lines. Quotes around a value are dropped. */
function frontmatter(path: string): Record<string, string> {
  const lines = read(path).split(/\r?\n/);
  const fields: Record<string, string> = {};
  if (lines[0]?.trim() !== '---') return fields;
  for (const line of lines.slice(1)) {
    if (line.trim() === '---') break;
    const match = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line);
    if (!match) continue;
    const value = (match[2] ?? '').trim().replace(/^"(.*)"$/, '$1');
    fields[match[1] ?? ''] = value;
  }
  return fields;
}

test('there are skills and agents to check', () => {
  assert.ok(skills.length >= 4);
  assert.ok(agents.length >= 4);
});

test('skills: size, name and a "Use when" description', () => {
  const problems: string[] = [];
  for (const path of skills) {
    const size = Buffer.byteLength(read(path), 'utf8');
    if (size >= 20_000) problems.push(`${path} is 20,000 bytes or more`);
    const fields = frontmatter(path);
    if (!fields.name) problems.push(`${path} has no name`);
    const description = fields.description ?? '';
    if (!description) {
      problems.push(`${path} has no description`);
      continue;
    }
    if (!description.startsWith('Use when')) {
      problems.push(`${path} description must start with "Use when"`);
    }
    if (description.length > 500) problems.push(`${path} description is over 500 characters`);
    // Claude Code shows a description escaped: `<slug>` reads "&lt;slug&gt;" in the menu.
    if (/[<>]/.test(description)) problems.push(`${path} description holds < or >`);
  }
  assert.deepEqual(problems, []);
});

test('the root skill is listed in the manifest, or an installed plugin never loads /kitvas', () => {
  if (!existsSync(join(PLUGIN_ROOT, 'SKILL.md'))) return;
  // An installed plugin reads skills from skills/ and from the manifest's paths only; "./" adds the
  // plugin folder itself, whose SKILL.md is then `kitvas:kitvas`, run by typing /kitvas.
  const manifest: unknown = JSON.parse(read('.claude-plugin/plugin.json'));
  const listed =
    typeof manifest === 'object' && manifest !== null && 'skills' in manifest
      ? manifest.skills
      : undefined;
  assert.ok(Array.isArray(listed) && listed.includes('./'), 'plugin.json "skills" must hold "./"');
});

test('agents: frontmatter fields and no Bash tool', () => {
  const problems: string[] = [];
  for (const path of agents) {
    const fields = frontmatter(path);
    for (const key of ['name', 'description', 'tools', 'model']) {
      if (!fields[key]) problems.push(`${path} has no ${key}`);
    }
    const tools = (fields.tools ?? '').split(',').map((tool) => tool.trim());
    if (tools.includes('Bash')) problems.push(`${path} lists Bash in tools`);
  }
  assert.deepEqual(problems, []);
});
