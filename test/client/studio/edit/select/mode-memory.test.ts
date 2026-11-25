import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  type ModeStorage,
  modeKey,
  opensInEdit,
  readMode,
  storedMode,
  writeMode,
} from '../../../../../client/studio/edit/select/mode-memory.ts';

function fakeStorage(): ModeStorage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
  };
}

test('the editor opens in Edit only when the person chose Edit and the version can be edited', () => {
  assert.equal(opensInEdit('edit', true), true);
  assert.equal(opensInEdit('edit', false), false);
  assert.equal(opensInEdit('preview', true), false);
  assert.equal(opensInEdit(null, true), false);
});

test('a stored value that is not a mode is no choice', () => {
  assert.equal(storedMode('edit'), 'edit');
  assert.equal(storedMode('preview'), 'preview');
  assert.equal(storedMode('zoom'), null);
  assert.equal(storedMode(null), null);
});

test('the choice is kept per draft and read back after a version switch', () => {
  const storage = fakeStorage();
  writeMode(storage, 'pricing', 'edit');
  assert.equal(readMode(storage, 'pricing'), 'edit');
  assert.equal(readMode(storage, 'other'), null);
  assert.ok(storage.map.has(modeKey('pricing')));
});

test('a storage that throws or is missing leaves the editor in Preview', () => {
  const broken: ModeStorage = {
    getItem: () => {
      throw new Error('blocked');
    },
    setItem: () => {
      throw new Error('blocked');
    },
  };
  assert.equal(readMode(broken, 'pricing'), null);
  assert.doesNotThrow(() => writeMode(broken, 'pricing', 'edit'));
  assert.equal(readMode(null, 'pricing'), null);
});
