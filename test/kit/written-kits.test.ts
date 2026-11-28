import assert from 'node:assert/strict';
import { join } from 'node:path';
import { test } from 'node:test';
import { createFolderKitStore } from '../../src/kit/adapters/folder-store.ts';
import {
  componentKind,
  importTargets,
  isProjectKit,
  isWrittenKit,
  moduleKind,
  parseSourceFlag,
  sourceIssues,
} from '../../src/kit/domain/sources.ts';
import { type Kit, type KitStore, loadKit, parseKit } from '../../src/kit/index.ts';
import { projectKitsDir } from '../../src/shared/index.ts';
import { tinyKitJson } from '../helpers/kit/kits.ts';
import {
  ACME_MAP,
  ACME_TOKENS,
  type Json,
  layeredStore,
  npmKitJson,
  repoKitJson,
  tempProject,
  webKitJson,
  writeProjectKit,
  writeText,
} from './helpers/project-kit.ts';

const kitOf = (raw: Json): Kit => parseKit(raw, String(raw.id));

const TOKENS = JSON.stringify(ACME_TOKENS);

/** A project with the web kit, its tokens, a reference image and two component files. */
function siteProject(raw: Json = webKitJson()): string {
  const project = tempProject();
  writeProjectKit(project, raw, {
    'json/tokens.json': TOKENS,
    'source/refs/Button.1.png': 'png',
    'components/Button.tsx': 'export function Button() { return null; }',
    'components/Button.module.css': '.root { color: red; }',
  });
  return project;
}

const hashOf = (project: string, id: string): string => loadKit(layeredStore(project), id).hash;

test('figma, web and images kits are written kits; the others are not', () => {
  assert.equal(isWrittenKit(kitOf(webKitJson())), true);
  assert.equal(isWrittenKit(kitOf({ ...webKitJson(), source: { type: 'images' } })), true);
  const figma = { type: 'figma', url: `https://www.figma.com/design/${'a'.repeat(22)}/Acme` };
  assert.equal(isWrittenKit(kitOf({ ...webKitJson(), source: figma })), true);
  assert.equal(isWrittenKit(kitOf(npmKitJson())), false);
  assert.equal(isWrittenKit(kitOf(repoKitJson())), false);
  assert.equal(isWrittenKit(kitOf(tinyKitJson())), false);
  assert.equal(isProjectKit(kitOf(webKitJson())), true);
});

test('a written kit imports files of its own components folder, and declared packages', () => {
  const kit = kitOf(webKitJson());
  assert.equal(componentKind(kit, 'components/Button'), 'kit');
  assert.equal(componentKind(kit, 'components/forms/Field.tsx'), 'kit');
  for (const bad of [
    'src/ds/Button',
    '@acme/ui',
    'react',
    'components/../x',
    '../components/Button',
    'components',
    'components/Button.js',
    'https://cdn.example/x.js',
  ]) {
    assert.equal(componentKind(kit, bad), undefined, bad);
  }
  assert.equal(moduleKind(kit, 'components/base.css'), 'kit');
  assert.equal(moduleKind(kit, 'react'), 'package');
  assert.equal(moduleKind(kit, 'react/jsx-runtime'), 'package');
  // No project paths, and no package the kit does not declare.
  assert.equal(moduleKind(kit, 'src/theme.css'), undefined);
  assert.equal(moduleKind(kit, '@acme/ui/styles.css'), undefined);
  assert.equal(moduleKind(kit, '../x.css'), undefined);
});

test('importTargets and sourceIssues of a written kit use kit paths', () => {
  const kit = kitOf(webKitJson());
  assert.deepEqual(
    importTargets(kit).map((target) => [target.at, target.kind]),
    [
      ['components.Button.import.from', 'kit'],
      ['components.Card.import.from', 'kit'],
      ['runtime.styles.imports.0', 'kit'],
    ],
  );
  assert.deepEqual(sourceIssues(kit), []);

  const raw = webKitJson();
  const [button] = raw.components as { import: { from: string } }[];
  assert.ok(button);
  button.import.from = 'src/ds/Button';
  (raw.runtime as { styles: { imports: string[] } }).styles.imports = ['@acme/ui/styles.css'];
  assert.deepEqual(sourceIssues(kitOf(raw)), [
    {
      path: 'components.Button.import.from',
      key: 'kitIssue.importNotKitPath',
      params: { component: 'Button', from: 'src/ds/Button' },
    },
    {
      path: 'runtime.styles.imports.0',
      key: 'kitIssue.importNotKitPath',
      params: { component: 'runtime.styles.imports', from: '@acme/ui/styles.css' },
    },
  ]);
});

test('npm and repo kits keep their rules: kit paths are not theirs', () => {
  assert.equal(componentKind(kitOf(npmKitJson()), 'components/Button'), 'package');
  assert.equal(componentKind(kitOf(repoKitJson()), 'components/Button'), 'project');
  assert.equal(moduleKind(kitOf(repoKitJson()), 'components/base.css'), 'project');
});

test('a code kit is a written kit, and its components are kit files', () => {
  const kit = kitOf({ ...webKitJson(), source: { type: 'code', path: 'src/app/ui' } });
  assert.equal(isWrittenKit(kit), true);
  assert.equal(componentKind(kit, 'components/Button'), 'kit');
  assert.equal(componentKind(kit, 'src/app/ui/Button'), undefined);
});

test('parseSourceFlag reads figma:, web: and images: too', () => {
  const figma = `https://www.figma.com/design/${'a'.repeat(22)}/Acme?node-id=1-2`;
  assert.deepEqual(parseSourceFlag(`figma:${figma}`), { type: 'figma', value: figma });
  // The address is kept as written: no slash trimming, no case change.
  assert.deepEqual(parseSourceFlag('web:https://Example.com/Path/?a=b#c'), {
    type: 'web',
    value: 'https://Example.com/Path/?a=b#c',
  });
  assert.deepEqual(parseSourceFlag('images:./shots/'), { type: 'images', value: 'shots' });
  assert.deepEqual(parseSourceFlag('images:design\\screens'), {
    type: 'images',
    value: 'design/screens',
  });
  assert.deepEqual(parseSourceFlag('images:../up'), { type: 'images', value: '../up' });
  for (const bad of ['figma:', 'web:', 'images:', 'images:./', 'web: ', 'url:https://x.test']) {
    assert.equal(parseSourceFlag(bad), undefined, bad);
  }
});

test('a valid written kit loads without issues', () => {
  const loaded = loadKit(layeredStore(siteProject()), 'site');
  assert.deepEqual(loaded.issues, []);
  assert.equal(loaded.project !== undefined, true);
});

test('a reference that is not in the kit folder does not stop the kit (look reports it)', () => {
  const raw = webKitJson();
  const project = tempProject();
  writeProjectKit(project, raw, { 'json/tokens.json': TOKENS });
  assert.deepEqual(loadKit(layeredStore(project), 'site').issues, []);
});

test('editing a component changes the hash of a written kit; the same files keep it', () => {
  const project = siteProject();
  const first = hashOf(project, 'site');
  assert.equal(hashOf(project, 'site'), first);

  const dir = join(projectKitsDir(project), 'site');
  writeText(join(dir, 'components', 'Button.tsx'), 'export function Button() { return 1; }');
  const edited = hashOf(project, 'site');
  assert.notEqual(edited, first);

  writeText(join(dir, 'components', 'Button.module.css'), '.root { color: blue; }');
  assert.notEqual(hashOf(project, 'site'), edited);

  // A new file in a folder of the components counts as well.
  const before = hashOf(project, 'site');
  writeText(join(dir, 'components', 'forms', 'Field.tsx'), 'export {};');
  assert.notEqual(hashOf(project, 'site'), before);
});

test('editing an original makes the kit stale', () => {
  const codeJson = { ...webKitJson(), source: { type: 'code', path: 'src/app/ui' } };
  const project = siteProject(codeJson);
  const dir = join(projectKitsDir(project), 'site');
  const first = hashOf(project, 'site');
  writeText(join(dir, 'originals', 'Button.1.html'), '<button class="btn">Save</button>');
  const added = hashOf(project, 'site');
  assert.notEqual(added, first);
  writeText(join(dir, 'originals', 'Button.1.html'), '<button class="btn">Send</button>');
  assert.notEqual(hashOf(project, 'site'), added);

  // A web kit does not read that folder.
  const web = siteProject();
  const before = hashOf(web, 'site');
  writeText(join(projectKitsDir(web), 'site', 'originals', 'Button.1.html'), '<b></b>');
  assert.equal(hashOf(web, 'site'), before);
});

test('files outside components/ do not change the hash of a written kit', () => {
  const project = siteProject();
  const first = hashOf(project, 'site');
  writeText(join(projectKitsDir(project), 'site', 'source', 'notes.txt'), 'notes');
  writeText(join(projectKitsDir(project), 'site', 'generated', 'kit.ts'), '// generated');
  assert.equal(hashOf(project, 'site'), first);
});

test('an npm kit keeps its hash whatever sits in a components folder', () => {
  const project = tempProject();
  const files = {
    'json/tokens.json': TOKENS,
    'json/css-var-map.json': JSON.stringify(ACME_MAP),
  };
  writeProjectKit(project, npmKitJson(), files);
  const first = hashOf(project, 'acme');
  const dir = join(projectKitsDir(project), 'acme');
  writeText(join(dir, 'components', 'Button.tsx'), 'export {};');
  assert.equal(hashOf(project, 'acme'), first);
  writeText(join(dir, 'components', 'Button.tsx'), 'export const x = 1;');
  assert.equal(hashOf(project, 'acme'), first);
});

test('a store without readTree hashes a written kit by its parts only', () => {
  const project = siteProject();
  const full = layeredStore(project);
  const plain: KitStore = {
    list: full.list,
    read: full.read,
    readJson: full.readJson,
    exists: full.exists,
  };
  const withoutTree = loadKit(plain, 'site').hash;
  assert.match(withoutTree, /^[0-9a-f]{64}$/);
  assert.notEqual(withoutTree, loadKit(full, 'site').hash);
});

test('readTree lists the files of a folder of the kit with forward slashes, sorted', () => {
  const project = siteProject();
  writeText(join(projectKitsDir(project), 'site', 'components', 'forms', 'Field.tsx'), 'field');
  const store = createFolderKitStore(projectKitsDir(project));
  assert.ok(store.readTree);
  const tree = store.readTree('site', 'components');
  assert.deepEqual(Object.keys(tree), [
    'components/Button.module.css',
    'components/Button.tsx',
    'components/forms/Field.tsx',
  ]);
  assert.equal(tree['components/forms/Field.tsx'], 'field');
  assert.deepEqual(store.readTree('site', 'nothing'), {});
  assert.deepEqual(store.readTree('site', '../other'), {});
  assert.deepEqual(store.readTree('nope', 'components'), {});
  assert.deepEqual(layeredStore(project).readTree?.('site', 'nothing'), {});
  assert.equal(Object.keys(layeredStore(project).readTree?.('site', 'components') ?? {}).length, 3);
});
