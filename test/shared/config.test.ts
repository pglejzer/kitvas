import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { KitvasError } from '../../src/shared/errors/errors.ts';
import { loadSettings, saveProjectKit } from '../../src/shared/settings/config.ts';
import { initWorkspace } from '../../src/shared/settings/workspace.ts';
import { tempDir } from '../helpers/tmp.ts';

function write(dir: string, value: unknown): void {
  mkdirSync(join(dir, '.kitvas'), { recursive: true });
  writeFileSync(join(dir, '.kitvas', 'config.json'), JSON.stringify(value));
}

test('defaults when nothing is configured', () => {
  const home = tempDir();
  const cwd = tempDir();
  assert.deepEqual(loadSettings({ home, cwd }), {
    language: 'en',
    kit: 'base',
    workspace: { path: join(cwd, '.kitvas'), exists: false },
  });
});

test('reads the user language and the project kit', () => {
  const home = tempDir();
  const cwd = tempDir();
  write(home, { schemaVersion: 1, language: 'pl' });
  write(cwd, { schemaVersion: 1, kit: 'mui' });
  const settings = loadSettings({ home, cwd });
  assert.equal(settings.language, 'pl');
  assert.equal(settings.kit, 'mui');
  assert.equal(settings.workspace.exists, true);
});

test('rejects unknown fields, bad values and broken JSON with CONFIG_INVALID', () => {
  for (const value of [
    { schemaVersion: 1, extra: true },
    { schemaVersion: 1, kit: '../x' },
  ]) {
    const cwd = tempDir();
    write(cwd, value);
    assert.throws(
      () => loadSettings({ home: tempDir(), cwd }),
      (error: unknown) => error instanceof KitvasError && error.code === 'CONFIG_INVALID',
    );
  }
  const cwd = tempDir();
  mkdirSync(join(cwd, '.kitvas'));
  writeFileSync(join(cwd, '.kitvas', 'config.json'), '{not json');
  assert.throws(() => loadSettings({ home: tempDir(), cwd }), KitvasError);
});

test('saveProjectKit sets the project kit in the format init writes', () => {
  const cwd = tempDir();
  initWorkspace(cwd);
  saveProjectKit(cwd, 'acme');
  const file = join(cwd, '.kitvas', 'config.json');
  assert.equal(readFileSync(file, 'utf8'), '{\n  "schemaVersion": 1,\n  "kit": "acme"\n}\n');
  assert.equal(loadSettings({ home: tempDir(), cwd }).kit, 'acme');
});

test('saveProjectKit writes a config that was not there yet', () => {
  const cwd = tempDir();
  mkdirSync(join(cwd, '.kitvas'));
  saveProjectKit(cwd, 'firma');
  assert.equal(loadSettings({ home: tempDir(), cwd }).kit, 'firma');
});

test('saveProjectKit refuses an id that is not one and a config that is broken', () => {
  const invalid = (error: unknown) =>
    error instanceof KitvasError && error.code === 'CONFIG_INVALID';
  const cwd = tempDir();
  initWorkspace(cwd);
  assert.throws(() => saveProjectKit(cwd, '../x'), invalid);
  assert.equal(loadSettings({ home: tempDir(), cwd }).kit, 'base');
  writeFileSync(join(cwd, '.kitvas', 'config.json'), '{not json');
  assert.throws(() => saveProjectKit(cwd, 'acme'), invalid);
  assert.equal(readFileSync(join(cwd, '.kitvas', 'config.json'), 'utf8'), '{not json');
});
