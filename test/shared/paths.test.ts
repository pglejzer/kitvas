import assert from 'node:assert/strict';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import {
  hookDataDir,
  PLUGIN_ROOT,
  resolveDataDir,
  userDir,
  workspaceDir,
} from '../../src/shared/env/paths.ts';
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

test("hook data dir: CLAUDE_PLUGIN_DATA only beside this plugin's own CLAUDE_PLUGIN_ROOT", () => {
  const data = tempDir();
  assert.equal(
    hookDataDir({ CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT, CLAUDE_PLUGIN_DATA: data }, PLUGIN_ROOT),
    data,
  );
  // The same folder written another way: a trailing separator, and another letter case on Windows.
  const spelled =
    process.platform === 'win32' ? `${PLUGIN_ROOT.toUpperCase()}\\` : `${PLUGIN_ROOT}/`;
  assert.equal(
    hookDataDir({ CLAUDE_PLUGIN_ROOT: spelled, CLAUDE_PLUGIN_DATA: data }, PLUGIN_ROOT),
    data,
  );
  // Another plugin's pair, a data folder alone, a root alone and an empty value are all ignored.
  const other = tempDir();
  assert.equal(
    hookDataDir({ CLAUDE_PLUGIN_ROOT: other, CLAUDE_PLUGIN_DATA: data }, PLUGIN_ROOT),
    undefined,
  );
  assert.equal(hookDataDir({ CLAUDE_PLUGIN_DATA: data }, PLUGIN_ROOT), undefined);
  assert.equal(hookDataDir({ CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT }, PLUGIN_ROOT), undefined);
  assert.equal(
    hookDataDir({ CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT, CLAUDE_PLUGIN_DATA: '' }, PLUGIN_ROOT),
    undefined,
  );
  assert.equal(
    hookDataDir({ CLAUDE_PLUGIN_ROOT: join(other, 'gone'), CLAUDE_PLUGIN_DATA: data }, PLUGIN_ROOT),
    undefined,
  );
});
