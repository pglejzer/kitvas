import assert from 'node:assert/strict';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { PLUGIN_ROOT, resolveDataDir, userDir, workspaceDir } from '../../src/shared/env/paths.ts';
import { tempDir } from '../helpers/tmp.ts';

test('PLUGIN_ROOT is the repo root', () => {
  assert.ok(existsSync(join(PLUGIN_ROOT, 'package.json')));
});

test('user and workspace folders', () => {
  assert.equal(userDir('/h'), join('/h', '.kitvas'));
  assert.equal(workspaceDir('/p'), join('/p', '.kitvas'));
});

test('data dir: flag, then env, then pointer file, then default', () => {
  const home = tempDir();
  assert.equal(resolveDataDir({ flag: 'x', env: 'y', home }), resolve('x'));
  assert.equal(resolveDataDir({ env: 'y', home }), resolve('y'));
  assert.equal(resolveDataDir({ home }), join(home, '.kitvas', 'data'));
  mkdirSync(join(home, '.kitvas'));
  writeFileSync(join(home, '.kitvas', 'data-dir'), '/somewhere/data\n');
  assert.equal(resolveDataDir({ home }), '/somewhere/data');
});
