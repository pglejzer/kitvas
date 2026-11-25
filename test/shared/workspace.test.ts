import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { decisionsTemplate, parseDecisions } from '../../src/shared/settings/decisions.ts';
import { initWorkspace } from '../../src/shared/settings/workspace.ts';
import { tempDir } from '../helpers/tmp.ts';

test('creates the workspace with drafts, cache and a decisions file', () => {
  const cwd = tempDir();
  const result = initWorkspace(cwd);
  assert.deepEqual(result, { path: join(cwd, '.kitvas'), created: true });
  assert.ok(existsSync(join(cwd, '.kitvas', 'drafts')));
  assert.ok(existsSync(join(cwd, '.kitvas', 'cache')));
  assert.equal(existsSync(join(cwd, '.kitvas', 'config.json')), false);
  const text = readFileSync(join(cwd, '.kitvas', 'decisions.md'), 'utf8');
  assert.equal(text, decisionsTemplate());
  const parsed = parseDecisions(text);
  assert.deepEqual(parsed.settings, { kit: 'base' });
  assert.deepEqual(parsed.warnings, []);
  for (const heading of ['Kits', 'Copy', 'Layout', 'Checks', 'Other']) {
    assert.match(parsed.body, new RegExp(`^## ${heading}$`, 'm'));
  }
});

test('a second run changes nothing', () => {
  const cwd = tempDir();
  initWorkspace(cwd);
  const file = join(cwd, '.kitvas', 'decisions.md');
  writeFileSync(file, '---\nkit: mui\n---\n');
  assert.equal(initWorkspace(cwd).created, false);
  assert.equal(readFileSync(file, 'utf8'), '---\nkit: mui\n---\n');
});
