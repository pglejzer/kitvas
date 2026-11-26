import assert from 'node:assert/strict';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { createFolderKitStore } from '../../src/kit/adapters/folder-store.ts';
import {
  findComponent,
  listKits,
  loadKit,
  requireKit,
  summarizeKit,
  tokensToCss,
} from '../../src/kit/index.ts';
import { KitvasError, projectKitsDir } from '../../src/shared/index.ts';
import { copyKit, FIXTURE_KITS } from '../helpers/kit/kits.ts';
import { tempDir } from '../helpers/tmp.ts';
import {
  ACME_MAP,
  ACME_TOKENS,
  type Json,
  layeredStore,
  npmKitJson,
  tempProject,
  writeProjectKit,
} from './helpers/project-kit.ts';

const fixtures = createFolderKitStore(FIXTURE_KITS);

const hasCode = (code: string) => (error: unknown) =>
  error instanceof KitvasError && error.code === code;

test('loads a valid kit with its tokens and a stable hash', () => {
  const loaded = loadKit(fixtures, 'tiny');
  assert.equal(loaded.kit.name, 'Tiny');
  assert.equal(loaded.dir, join(FIXTURE_KITS, 'tiny'));
  assert.equal(loaded.tokens.length, 8);
  assert.deepEqual(loaded.issues, []);
  assert.match(loaded.hash, /^[0-9a-f]{64}$/);
  assert.equal(loadKit(fixtures, 'tiny').hash, loaded.hash);
  assert.equal(requireKit(fixtures, 'tiny').hash, loaded.hash);
});

test('an unknown or unsafe id is KIT_NOT_FOUND', () => {
  assert.throws(() => loadKit(fixtures, 'nope'), hasCode('KIT_NOT_FOUND'));
  assert.throws(() => loadKit(fixtures, '../kits/tiny'), hasCode('KIT_NOT_FOUND'));
  const missing = createFolderKitStore(join(tempDir(), 'missing'));
  assert.throws(() => loadKit(missing, 'tiny'), hasCode('KIT_NOT_FOUND'));
});

test('a kit.json that fails the schema or is not JSON is KIT_INVALID', () => {
  assert.throws(() => loadKit(fixtures, 'broken'), hasCode('KIT_INVALID'));
  const root = copyKit('tiny');
  writeFileSync(join(root, 'tiny', 'kit.json'), '{not json');
  assert.throws(() => loadKit(createFolderKitStore(root), 'tiny'), hasCode('KIT_INVALID'));
});

test('a folder name that differs from the id is an issue, and requireKit refuses the kit', () => {
  const store = createFolderKitStore(copyKit('tiny', 'other'));
  const loaded = loadKit(store, 'other');
  assert.deepEqual(
    loaded.issues.map((issue) => [issue.path, issue.key, issue.params]),
    [['id', 'kitIssue.idMismatch', { id: 'tiny', folder: 'other' }]],
  );
  assert.throws(
    () => requireKit(store, 'other'),
    (error: unknown) =>
      error instanceof KitvasError && error.code === 'KIT_INVALID' && error.params.detail === 'id',
  );
});

test('missing files are issues', () => {
  const root = copyKit('tiny');
  rmSync(join(root, 'tiny', 'scss', 'index.scss'));
  rmSync(join(root, 'tiny', 'json', 'tokens.json'));
  const loaded = loadKit(createFolderKitStore(root), 'tiny');
  assert.deepEqual(loaded.tokens, []);
  assert.deepEqual(
    loaded.issues.map((issue) => [issue.path, issue.key, issue.params.file]),
    [
      ['runtime.styles.files', 'kitIssue.fileMissing', 'scss/index.scss'],
      ['tokens.file', 'kitIssue.fileMissing', 'json/tokens.json'],
    ],
  );
});

test('token problems become issues of the kit', () => {
  const root = copyKit('tiny');
  writeFileSync(join(root, 'tiny', 'json', 'tokens.json'), '{"a":{"$value":1}}');
  const loaded = loadKit(createFolderKitStore(root), 'tiny');
  assert.deepEqual(
    loaded.issues.map((issue) => issue.key),
    ['kitIssue.tokenNoType'],
  );
});

test('the store never reads outside a kit folder', () => {
  assert.equal(fixtures.exists('tiny', 'json/tokens.json'), true);
  assert.equal(fixtures.exists('tiny', '../broken/kit.json'), false);
  assert.equal(fixtures.readJson('tiny', '../broken/kit.json'), undefined);
});

test('lists kits, valid or not', () => {
  assert.deepEqual(listKits(fixtures), [
    { id: 'broken', name: null, version: null, components: 0, valid: false },
    { id: 'tiny', name: 'Tiny', version: '1.0.0', components: 2, valid: true },
  ]);
  assert.deepEqual(listKits(createFolderKitStore(join(tempDir(), 'missing'))), []);
});

/** A project with the npm test kit, its tokens and its map file (`null`: no map file). */
function acmeProject(raw: Json = npmKitJson(), map: Json | null = ACME_MAP): string {
  const project = tempProject();
  const files: Record<string, string> = { 'json/tokens.json': JSON.stringify(ACME_TOKENS) };
  if (map) files['json/css-var-map.json'] = JSON.stringify(map);
  writeProjectKit(project, raw, files);
  return project;
}

test('a project kit knows its project and its map; its generated entry need not exist yet', () => {
  const project = acmeProject();
  const loaded = loadKit(layeredStore(project), 'acme');
  assert.deepEqual(loaded.issues, []);
  assert.equal(loaded.project, project);
  assert.equal(loaded.dir, join(projectKitsDir(project), 'acme'));
  assert.deepEqual(loaded.cssVarMap, ACME_MAP);
  assert.equal(
    tokensToCss(loaded.tokens, ':root', loaded.cssVarMap),
    ':root {\n  --kit-color-ink: var(--acme-color-ink);\n  --kit-space-sm: var(--acme-space-2);\n}\n',
  );
});

test('a built-in kit has no project and an empty map', () => {
  const loaded = loadKit(fixtures, 'tiny');
  assert.equal(loaded.project, undefined);
  assert.deepEqual(loaded.cssVarMap, {});
});

test('a project kit must use the generated entry', () => {
  const raw = npmKitJson();
  (raw.runtime as { entry: string }).entry = 'tsx/index.ts';
  const { issues } = loadKit(layeredStore(acmeProject(raw)), 'acme');
  assert.deepEqual(issues, [
    {
      path: 'runtime.entry',
      key: 'kitIssue.entryNotGenerated',
      params: { entry: 'tsx/index.ts', expected: 'generated/kit.ts' },
    },
  ]);
});

test('source rules are issues of the kit, so requireKit refuses it', () => {
  const raw = npmKitJson();
  const [button] = raw.components as { import: { from: string; name: string } }[];
  assert.ok(button);
  button.import = { from: '../../outside', name: 'Button' };
  const store = layeredStore(acmeProject(raw));
  assert.deepEqual(
    loadKit(store, 'acme').issues.map((issue) => [issue.path, issue.key]),
    [['components.Button.import.from', 'kitIssue.importNotPackage']],
  );
  assert.throws(() => requireKit(store, 'acme'), hasCode('KIT_INVALID'));
});

test('problems of the cssVars map are issues, and the good entries stay', () => {
  const map = {
    'color.ink': '--acme-color-ink',
    'color.nope': '--acme-nope',
    'space.sm': 'red; }',
  };
  const loaded = loadKit(layeredStore(acmeProject(npmKitJson(), map)), 'acme');
  assert.deepEqual(loaded.cssVarMap, { 'color.ink': '--acme-color-ink' });
  assert.deepEqual(loaded.issues, [
    {
      path: 'tokens.cssVars.map',
      key: 'kitIssue.tokenAliasMissing',
      params: { path: '--acme-nope', target: 'color.nope' },
    },
    {
      path: 'tokens.cssVars.map',
      key: 'kitIssue.tokenShape',
      params: { path: 'space.sm', type: 'cssVars.map' },
    },
  ]);

  const missing = loadKit(layeredStore(acmeProject(npmKitJson(), null)), 'acme');
  assert.deepEqual(missing.cssVarMap, {});
  assert.deepEqual(missing.issues, [
    {
      path: 'tokens.cssVars.map',
      key: 'kitIssue.fileMissing',
      params: { file: 'json/css-var-map.json' },
    },
  ]);
});

test('the hash changes with the map', () => {
  const first = loadKit(layeredStore(acmeProject()), 'acme').hash;
  const other = loadKit(layeredStore(acmeProject(npmKitJson(), { 'color.ink': '--x' })), 'acme');
  assert.equal(loadKit(layeredStore(acmeProject()), 'acme').hash, first);
  assert.notEqual(other.hash, first);
});

test('summarizes a kit and finds a component', () => {
  const loaded = loadKit(fixtures, 'tiny');
  const summary = summarizeKit(loaded);
  assert.deepEqual(
    {
      id: summary.id,
      name: summary.name,
      version: summary.version,
      source: summary.source,
      framework: summary.framework,
      tokens: summary.tokens,
      icons: summary.icons,
      issues: summary.issues,
    },
    {
      id: 'tiny',
      name: 'Tiny',
      version: '1.0.0',
      source: 'builtin',
      framework: 'react',
      tokens: 8,
      icons: 2,
      issues: 0,
    },
  );
  assert.deepEqual(summary.components, [
    { name: 'Button', category: 'action', description: 'Starts an action.' },
    { name: 'Icon', category: 'display', description: 'Shows an icon.' },
  ]);
  assert.equal(summary.gaps.length, 1);
  assert.equal(summary.hash, loaded.hash);
  assert.equal(findComponent(loaded, 'Button').props.length, 3);
  assert.throws(() => findComponent(loaded, 'Nope'), hasCode('KIT_COMPONENT_NOT_FOUND'));
});
