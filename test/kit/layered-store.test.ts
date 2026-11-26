import assert from 'node:assert/strict';
import { join } from 'node:path';
import { test } from 'node:test';
import { createFolderKitStore } from '../../src/kit/adapters/folder-store.ts';
import { createLayeredKitStore } from '../../src/kit/adapters/layered-store.ts';
import { listKits, loadKit } from '../../src/kit/index.ts';
import { projectKitsDir } from '../../src/shared/index.ts';
import { FIXTURE_KITS, tinyKitJson } from '../helpers/kit/kits.ts';
import {
  ACME_MAP,
  ACME_TOKENS,
  layeredStore,
  npmKitJson,
  tempProject,
  writeProjectKit,
} from './helpers/project-kit.ts';

/** A project with the kit `acme` and a folder `tiny` that a built-in kit of the same id hides. */
function project(): string {
  const dir = tempProject();
  writeProjectKit(dir, npmKitJson(), {
    'json/tokens.json': JSON.stringify(ACME_TOKENS),
    'json/css-var-map.json': JSON.stringify(ACME_MAP),
  });
  writeProjectKit(dir, { ...tinyKitJson(), name: 'Project Tiny' }, { 'only-here.txt': 'x' });
  return dir;
}

test('lists both layers once, sorted', () => {
  assert.deepEqual(layeredStore(project()).list(), ['acme', 'broken', 'tiny']);
});

test('reads a built-in kit first and marks project kits with their project', () => {
  const dir = project();
  const store = layeredStore(dir);
  const tiny = store.read('tiny');
  assert.equal(tiny?.dir, join(FIXTURE_KITS, 'tiny'));
  assert.equal(tiny?.project, undefined);
  const acme = store.read('acme');
  assert.equal(acme?.dir, join(projectKitsDir(dir), 'acme'));
  assert.equal(acme?.project, dir);
  assert.equal(store.read('nope'), undefined);
});

test('files of a kit come from the layer that owns its id', () => {
  const store = layeredStore(project());
  assert.equal(store.exists('acme', 'json/css-var-map.json'), true);
  assert.deepEqual(store.readJson('acme', 'json/css-var-map.json'), ACME_MAP);
  // The hidden project copy of `tiny` has this file; the built-in kit that wins does not.
  assert.equal(store.exists('tiny', 'only-here.txt'), false);
  assert.equal(store.exists('tiny', 'json/tokens.json'), true);
});

test('a project folder with a built-in id is shadowed: the built-in kit wins everywhere', () => {
  const store = layeredStore(project());
  assert.deepEqual(store.shadowedIds?.(), ['tiny']);
  assert.equal(loadKit(store, 'tiny').kit.name, 'Tiny');
  assert.deepEqual(
    listKits(store).map((kit) => [kit.id, kit.name]),
    [
      ['acme', 'Acme UI'],
      ['broken', null],
      ['tiny', 'Tiny'],
    ],
  );
});

test('without a project layer the store is the built-in one', () => {
  const store = createLayeredKitStore(createFolderKitStore(FIXTURE_KITS), undefined);
  assert.deepEqual(store.list(), ['broken', 'tiny']);
  assert.deepEqual(store.shadowedIds?.(), []);
  assert.equal(store.read('tiny')?.project, undefined);
  assert.equal(store.read('acme'), undefined);
});
