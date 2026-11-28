import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { createFolderKitWriter } from '../../../src/kit/adapters/folder-writer.ts';
import { createProjectFiles } from '../../../src/kit/adapters/project-files.ts';
import { type Origins, parseOrigins } from '../../../src/kit/domain/origins.ts';
import {
  addImages,
  type OriginsDeps,
  outdatedComponents,
  recordOrigins,
} from '../../../src/kit/index.ts';
import { KitvasError, projectKitsDir } from '../../../src/shared/index.ts';
import { fixtureProject } from '../../helpers/kit/projects.ts';
import { layeredStore, npmKitJson, tempProject, writeProjectKit } from '../helpers/project-kit.ts';

const BUTTON_TS = 'src/app/button/button.component.ts';
const BUTTON_CSS = 'src/app/button/button.component.css';

function setup() {
  const { dir, kitId } = fixtureProject('acme-templates');
  const deps: OriginsDeps = {
    kits: layeredStore(dir),
    kitWriter: createFolderKitWriter(projectKitsDir(dir)),
    files: createProjectFiles(dir),
  };
  const kitDir = join(projectKitsDir(dir), kitId);
  const origins = (): Origins => parseOrigins(readFileSync(join(kitDir, 'origins.json'), 'utf8'));
  const edit = (path: string, change: (text: string) => string): void => {
    const file = join(dir, ...path.split('/'));
    writeFileSync(file, change(readFileSync(file, 'utf8')));
  };
  const editKit = (path: string, change: (text: string) => string): void => {
    const file = join(kitDir, ...path.split('/'));
    writeFileSync(file, change(readFileSync(file, 'utf8')));
  };
  return { dir, kitId, deps, origins, edit, editKit };
}

test('a new component is recorded, a known one is left', () => {
  const h = setup();
  assert.deepEqual(recordOrigins(h.deps, h.kitId, { current: [] }), ['Button', 'Field', 'Card']);
  const first = h.origins();
  assert.deepEqual(Object.keys(first.components), ['Button', 'Field', 'Card']);
  assert.deepEqual(outdatedComponents(h.deps, h.kitId), []);

  h.edit(BUTTON_TS, (text) => `${text}\n// changed`);
  assert.deepEqual(recordOrigins(h.deps, h.kitId, { current: [] }), []);
  assert.deepEqual(h.origins(), first);
  assert.deepEqual(outdatedComponents(h.deps, h.kitId), [{ name: 'Button', reason: 'changed' }]);
});

test('a rewritten copy is recorded again', () => {
  const h = setup();
  recordOrigins(h.deps, h.kitId, { current: [] });
  const first = h.origins();
  h.edit(BUTTON_CSS, (text) => `${text}\n/* changed */`);
  h.editKit('components/Button.module.css', (text) => `${text}\n/* rewritten */`);
  assert.deepEqual(recordOrigins(h.deps, h.kitId, { current: [] }), ['Button']);
  const after = h.origins();
  assert.notEqual(after.components.Button?.project, first.components.Button?.project);
  assert.notEqual(after.components.Button?.copy, first.components.Button?.copy);
  assert.deepEqual(after.components.Card, first.components.Card);
  assert.deepEqual(outdatedComponents(h.deps, h.kitId), []);
});

test('--current records it as it is', () => {
  const h = setup();
  recordOrigins(h.deps, h.kitId, { current: [] });
  h.edit(BUTTON_TS, (text) => `${text}\n// changed`);
  assert.deepEqual(recordOrigins(h.deps, h.kitId, { current: ['Button'] }), ['Button']);
  assert.deepEqual(outdatedComponents(h.deps, h.kitId), []);
});

test('a record of a removed component is dropped', () => {
  const h = setup();
  recordOrigins(h.deps, h.kitId, { current: [] });
  h.editKit('kit.json', (text) => {
    const json = JSON.parse(text) as { components: { name: string }[] };
    json.components = json.components.filter((component) => component.name !== 'Card');
    return JSON.stringify(json, null, 2);
  });
  recordOrigins(h.deps, h.kitId, { current: [] });
  assert.deepEqual(Object.keys(h.origins().components), ['Button', 'Field']);
});

test('line ends do not count', () => {
  const h = setup();
  recordOrigins(h.deps, h.kitId, { current: [] });
  h.edit(BUTTON_TS, (text) => text.replaceAll('\r\n', '\n').replaceAll('\n', '\r\n'));
  assert.deepEqual(outdatedComponents(h.deps, h.kitId), []);
});

test('a missing file is gone', () => {
  const h = setup();
  recordOrigins(h.deps, h.kitId, { current: [] });
  const files = h.deps.files;
  const missing: OriginsDeps = {
    ...h.deps,
    files: {
      packageVersion: files.packageVersion.bind(files),
      readBytes: (path) => (path === BUTTON_CSS ? undefined : files.readBytes(path)),
    },
  };
  assert.deepEqual(outdatedComponents(missing, h.kitId), [{ name: 'Button', reason: 'gone' }]);
});

test('a kit that is not a code kit has nothing recorded and nothing out of date', () => {
  const project = tempProject();
  writeProjectKit(project, npmKitJson());
  const deps: OriginsDeps = {
    kits: layeredStore(project),
    kitWriter: createFolderKitWriter(projectKitsDir(project)),
    files: createProjectFiles(project),
  };
  assert.deepEqual(recordOrigins(deps, 'acme', { current: [] }), []);
  assert.equal(existsSync(join(projectKitsDir(project), 'acme', 'origins.json')), false);
  assert.deepEqual(outdatedComponents(deps, 'acme'), []);
});

test('a package is hashed by its installed version', () => {
  const h = setup();
  h.editKit('kit.json', (text) => {
    const json = JSON.parse(text) as { components: { name: string; project: unknown }[] };
    const button = json.components.find((component) => component.name === 'Button');
    if (button) button.project = { package: 'react' };
    return JSON.stringify(json, null, 2);
  });
  recordOrigins(h.deps, h.kitId, { current: [] });
  assert.deepEqual(outdatedComponents(h.deps, h.kitId), []);
  const files = h.deps.files;
  const upgraded: OriginsDeps = {
    ...h.deps,
    files: {
      readBytes: files.readBytes.bind(files),
      packageVersion: (name) => (name === 'react' ? '99.0.0' : files.packageVersion(name)),
    },
  };
  assert.deepEqual(outdatedComponents(upgraded, h.kitId), [{ name: 'Button', reason: 'changed' }]);
});

test('images are refused for an npm kit and a missing kit', () => {
  const project = tempProject({ 'shots/a.png': 'x' });
  writeProjectKit(project, npmKitJson());
  const deps = {
    kits: layeredStore(project),
    kitWriter: createFolderKitWriter(projectKitsDir(project)),
    files: createProjectFiles(project),
  };
  assert.throws(
    () => addImages(deps, 'acme', 'shots'),
    (error) => error instanceof KitvasError && error.code === 'KIT_SOURCE_INVALID',
  );
  assert.throws(
    () => addImages(deps, 'nope', 'shots'),
    (error) => error instanceof KitvasError && error.code === 'KIT_NOT_FOUND',
  );
});
