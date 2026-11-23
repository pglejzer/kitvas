import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { initWorkspace } from '../../src/shared/settings/workspace.ts';
import { tempDir } from '../helpers/tmp.ts';

test('creates the workspace with drafts, cache and a config', () => {
  const cwd = tempDir();
  const result = initWorkspace(cwd);
  assert.deepEqual(result, { path: join(cwd, '.kitvas'), created: true });
  assert.ok(existsSync(join(cwd, '.kitvas', 'drafts')));
  assert.ok(existsSync(join(cwd, '.kitvas', 'cache')));
  const config = JSON.parse(readFileSync(join(cwd, '.kitvas', 'config.json'), 'utf8'));
  assert.deepEqual(config, { schemaVersion: 1, kit: 'base' });
});

test('a second run changes nothing', () => {
  const cwd = tempDir();
  initWorkspace(cwd);
  const file = join(cwd, '.kitvas', 'config.json');
  writeFileSync(file, '{"schemaVersion":1,"kit":"mui"}');
  assert.equal(initWorkspace(cwd).created, false);
  assert.equal(readFileSync(file, 'utf8'), '{"schemaVersion":1,"kit":"mui"}');
});
