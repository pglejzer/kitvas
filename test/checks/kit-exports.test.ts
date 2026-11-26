// `kit exports` with the real bundler over the fixture projects: the names come from the package or
// the folder, never from kit.json.

import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, test } from 'node:test';
import {
  type ExportsDeps,
  isSourceModule,
  type KitExports,
  kitExports,
  splitExports,
} from '../../src/checks/index.ts';
import { createProjectFiles } from '../../src/kit/adapters/project-files.ts';
import { catalogDir, KitvasError, projectKitsDir } from '../../src/shared/index.ts';
import { fixtureProject, removeFixture } from '../helpers/projects.ts';
import { closeRenderTools, renderTools } from '../helpers/render.ts';
import {
  type Json,
  layeredStore,
  npmKitJson,
  tempProject,
  webKitJson,
  writeProjectKit,
  writeText,
} from '../kit/helpers/project-kit.ts';

const tools = renderTools();
after(() => closeRenderTools(tools));

const deps = (project: string): ExportsDeps => ({
  kits: layeredStore(project),
  bundler: tools.bundler,
  projectFiles: createProjectFiles,
});

/** The kit.json of a fixture project's kit, changed by `change` and written back. */
function editKit(dir: string, kitId: string, change: (json: Json) => void): void {
  const file = join(projectKitsDir(dir), kitId, 'kit.json');
  const json = JSON.parse(readFileSync(file, 'utf8')) as Json;
  change(json);
  writeFileSync(file, JSON.stringify(json, null, 2));
}

const failsWith = (code: string) => (error: unknown) =>
  error instanceof KitvasError && error.code === code;

test('an npm kit: the names its package exports, the ones it has and the ones open', async () => {
  const { dir, kitId } = fixtureProject('acme-npm');
  try {
    const found: KitExports = await kitExports(deps(dir), kitId);
    assert.deepEqual(found, {
      id: 'acme',
      source: { type: 'npm', package: '@acme/ui', version: '1.2.0' },
      total: 4,
      covered: ['Badge', 'Button', 'TextField'],
      open: ['AcmeProvider'],
    });
    // Nothing is written: no catalog folder, no tsconfig of kitvas.
    assert.equal(existsSync(catalogDir(dir, kitId)), false);
  } finally {
    removeFixture(dir);
  }
});

test('a part of a component is covered; a name gaps holds as unsupported is left out', async () => {
  const { dir, kitId } = fixtureProject('acme-npm');
  try {
    editKit(dir, kitId, (json) => {
      const components = json.components as Json[];
      json.components = components.filter((entry) => entry.name !== 'Badge');
      const button = components.find((entry) => entry.name === 'Button');
      if (button) button.parts = ['Badge'];
      json.gaps = [
        { path: 'AcmeProvider', reason: 'unsupported' },
        { path: 'TextField', reason: 'missing' },
      ];
    });
    const found = await kitExports(deps(dir), kitId);
    assert.deepEqual(found.covered, ['Badge', 'Button', 'TextField']);
    assert.deepEqual(found.open, []);
    assert.equal(found.total, 3);
  } finally {
    removeFixture(dir);
  }
});

test('a kit just made by kit new, with no component yet, is listed: everything is open', async () => {
  const { dir, kitId } = fixtureProject('acme-npm');
  try {
    editKit(dir, kitId, (json) => {
      json.components = [];
    });
    const found = await kitExports(deps(dir), kitId);
    assert.deepEqual(found.covered, []);
    assert.deepEqual(found.open, ['AcmeProvider', 'Badge', 'Button', 'TextField']);
    assert.equal(found.total, 4);
  } finally {
    removeFixture(dir);
  }
});

test('a repo kit: the exports of the modules of its folder, tests and types left out', async () => {
  const { dir, kitId } = fixtureProject('acme-repo');
  try {
    const ds = join(dir, 'src', 'ds');
    writeText(
      join(ds, 'Badge.tsx'),
      'export const badgeTones = ["info"];\nexport function Badge() {\n  return <span />;\n}\n',
    );
    // A test file would not bundle (its package is missing): it is not read.
    const missing = 'import { render } from "no-such-package";\nrender();\n';
    writeText(join(ds, 'Badge.test.tsx'), missing);
    writeText(join(ds, 'types.d.ts'), 'export declare const Typed: number;\n');
    const found = await kitExports(deps(dir), kitId);
    assert.deepEqual(found.source, { type: 'repo', path: 'src/ds' });
    assert.deepEqual(found.covered, ['Button', 'Card', 'Stack']);
    assert.deepEqual(found.open, ['Badge']);
    assert.equal(found.total, 4);
  } finally {
    removeFixture(dir);
  }
});

test('a source that does not bundle is KIT_SOURCE_INVALID with the first build error', async () => {
  const { dir, kitId } = fixtureProject('acme-repo');
  try {
    writeText(join(dir, 'src', 'ds', 'Broken.tsx'), 'export function Broken( {\n');
    await assert.rejects(kitExports(deps(dir), kitId), (error: unknown) => {
      assert.ok(error instanceof KitvasError);
      assert.equal(error.code, 'KIT_SOURCE_INVALID');
      assert.match(String(error.params.detail), /Broken\.tsx/);
      return true;
    });
  } finally {
    removeFixture(dir);
  }
});

test('a package that is not installed is KIT_PACKAGE_MISSING; nothing is bundled', async () => {
  const project = tempProject();
  writeProjectKit(project, npmKitJson());
  await assert.rejects(kitExports(deps(project), 'acme'), failsWith('KIT_PACKAGE_MISSING'));
});

test('a written kit, a built-in kit and a missing folder have nothing to list', async () => {
  const project = tempProject();
  writeProjectKit(project, webKitJson());
  writeProjectKit(project, {
    ...npmKitJson(),
    id: 'gone',
    source: { type: 'repo', path: 'src/gone' },
  });
  await assert.rejects(kitExports(deps(project), 'site'), failsWith('KIT_SOURCE_INVALID'));
  await assert.rejects(kitExports(deps(project), 'tiny'), failsWith('KIT_SOURCE_INVALID'));
  await assert.rejects(kitExports(deps(project), 'gone'), failsWith('KIT_SOURCE_INVALID'));
  await assert.rejects(kitExports(deps(project), 'nope'), failsWith('KIT_NOT_FOUND'));
});

test('the bundler reads the exports of a module without running it', async () => {
  const project = tempProject({
    'src/lib/a.ts': 'export const Alpha = 1;\nexport type T = string;\nthrow new Error("ran");\n',
    'src/lib/b.ts': 'export { Alpha as Beta } from "./a";\nexport default function Gamma() {}\n',
  });
  const lib = `${project.split('\\').join('/')}/src/lib`;
  const read = await tools.bundler.exportNames({
    workingDir: project,
    modules: [`${lib}/a.ts`, `${lib}/b.ts`],
    project,
  });
  assert.deepEqual(read, { names: ['Alpha', 'Beta'], errors: [] });
  assert.deepEqual(await tools.bundler.exportNames({ workingDir: project, modules: [] }), {
    names: [],
    errors: [],
  });
});

test('splitExports counts component names only, each once, sorted', () => {
  const kitJson = {
    components: [{ name: 'Card', parts: ['CardBody'] }, { name: 'Button' }, 'junk'],
    gaps: [
      { path: 'Grid', reason: 'unsupported' },
      { path: 'Alert', reason: 'missing' },
    ],
  };
  const names = ['useTheme', 'Card', 'Alert', 'THEME_ID', 'CardBody', 'Grid', 'Card', 'Button'];
  assert.deepEqual(splitExports(names, kitJson), {
    total: 4,
    covered: ['Button', 'Card', 'CardBody'],
    open: ['Alert'],
  });
  assert.deepEqual(splitExports(['Zed'], null), { total: 1, covered: [], open: ['Zed'] });
});

test('a repo folder is read through its scripts, not its tests, stories or types', () => {
  const files = ['Button.tsx', 'index.ts', 'menu/Menu.jsx', 'util.mjs', 'Button.test.tsx'];
  files.push('Button.stories.tsx', 'types.d.ts', '__tests__/Button.tsx', 'Button.module.css');
  const scripts = ['Button.tsx', 'index.ts', 'menu/Menu.jsx', 'util.mjs'];
  assert.deepEqual(files.filter(isSourceModule), scripts);
});
