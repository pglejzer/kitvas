import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { KitvasError } from '../../src/shared/errors/errors.ts';
import {
  createViewStore,
  DEFAULT_VIEW,
  loadSettings,
  memoryViewStore,
  VIEW_ACCENTS,
  type ViewSettings,
} from '../../src/shared/settings/config.ts';
import { ACCENTS } from '../../src/studio/theme/tokens.ts';
import { tempDir } from '../helpers/tmp.ts';

const file = (home: string): string => join(home, '.kitvas', 'config.json');

function write(home: string, text: string): void {
  mkdirSync(join(home, '.kitvas'), { recursive: true });
  writeFileSync(file(home), text);
}

const DARK: ViewSettings = { theme: 'dark', panels: 'flush', accent: 'teal' };

test('the view is the default until the person changes it', () => {
  const home = tempDir();
  assert.deepEqual(createViewStore(home).read(), DEFAULT_VIEW);
  assert.deepEqual(DEFAULT_VIEW, { theme: 'system', panels: 'cards', accent: 'copper' });
});

test('a written view is read back by another store, and the other settings stay', () => {
  const home = tempDir();
  write(home, JSON.stringify({ schemaVersion: 1, language: 'pl', studioIdleMinutes: 30 }));
  createViewStore(home).write(DARK);
  assert.deepEqual(createViewStore(home).read(), DARK);
  assert.deepEqual(JSON.parse(readFileSync(file(home), 'utf8')), {
    schemaVersion: 1,
    language: 'pl',
    studioIdleMinutes: 30,
    view: DARK,
  });
  const settings = loadSettings({ home, cwd: tempDir() });
  assert.equal(settings.language, 'pl');
  assert.equal(settings.studioIdleMinutes, 30);
});

test('the first write makes the folder and the file', () => {
  const home = tempDir();
  createViewStore(home).write(DARK);
  const kept: unknown = JSON.parse(readFileSync(file(home), 'utf8'));
  assert.deepEqual(kept, { schemaVersion: 1, view: DARK });
});

test('a setting the file leaves out stays out, so it keeps following its default', () => {
  const home = tempDir();
  write(home, JSON.stringify({ schemaVersion: 1, language: 'pl' }));
  createViewStore(home).write(DARK);
  const kept: unknown = JSON.parse(readFileSync(file(home), 'utf8'));
  assert.deepEqual(kept, { schemaVersion: 1, language: 'pl', view: DARK });
  assert.equal(loadSettings({ home, cwd: tempDir() }).studioIdleMinutes, 240);
});

test('a file with a wrong setting is not written over, whatever the view', () => {
  const home = tempDir();
  const text = JSON.stringify({ schemaVersion: 1, language: 'Polish' });
  write(home, text);
  assert.throws(
    () => createViewStore(home).write(DARK),
    (error) => error instanceof KitvasError && error.code === 'CONFIG_INVALID',
  );
  assert.equal(readFileSync(file(home), 'utf8'), text);
});

test('a broken file never takes a page down: the last view read answers', () => {
  const home = tempDir();
  const store = createViewStore(home);
  store.write(DARK);
  write(home, '{ not json');
  assert.deepEqual(store.read(), DARK);
  // A store that never read a good file answers the default.
  assert.deepEqual(createViewStore(home).read(), DEFAULT_VIEW);
});

test('a view with an unknown value in the file is not used', () => {
  const home = tempDir();
  write(home, JSON.stringify({ schemaVersion: 1, view: { ...DARK, accent: 'purple' } }));
  assert.deepEqual(createViewStore(home).read(), DEFAULT_VIEW);
});

test('writing into a broken file says so and leaves it alone', () => {
  const home = tempDir();
  write(home, '{ not json');
  assert.throws(
    () => createViewStore(home).write(DARK),
    (error) => error instanceof KitvasError && error.code === 'CONFIG_INVALID',
  );
  assert.equal(readFileSync(file(home), 'utf8'), '{ not json');
});

test('a view in memory holds what was written', () => {
  const store = memoryViewStore();
  assert.deepEqual(store.read(), DEFAULT_VIEW);
  store.write(DARK);
  assert.deepEqual(store.read(), DARK);
});

test('the settings know the same accents as the theme', () => {
  assert.deepEqual([...VIEW_ACCENTS], [...ACCENTS]);
});
