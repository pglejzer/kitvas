import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { createFolderKitWriter } from '../../src/kit/adapters/folder-writer.ts';
import { createProjectFiles } from '../../src/kit/adapters/project-files.ts';
import { loadKit, type NewKitDeps, newKit } from '../../src/kit/index.ts';
import { KitvasError, projectKitsDir } from '../../src/shared/index.ts';
import {
  type FakePackage,
  layeredStore,
  tempProject,
  writeProjectKit,
  writeText,
} from './helpers/project-kit.ts';

const REACT: Record<string, FakePackage> = {
  react: { version: '19.3.1' },
  'react-dom': { version: '19.3.1' },
};

const deps = (project: string): NewKitDeps => ({
  kits: layeredStore(project),
  kitWriter: createFolderKitWriter(projectKitsDir(project)),
  files: createProjectFiles(project),
  kitsDir: projectKitsDir(project),
});

const fails =
  (code: string, params?: Record<string, string | number>) =>
  (error: unknown): boolean => {
    assert.ok(error instanceof KitvasError, String(error));
    assert.equal(error.code, code);
    if (params) assert.deepEqual(error.params, params);
    return true;
  };

const readKitJson = (project: string, id: string): unknown =>
  JSON.parse(readFileSync(join(projectKitsDir(project), id, 'kit.json'), 'utf8'));

test('an npm kit gets the installed versions, an empty token file and its entry', () => {
  const project = tempProject({}, { '@acme/ui': { version: '1.2.0' }, ...REACT });
  const created = newKit(deps(project), 'acme', { type: 'npm', value: '@acme/ui/Button' });
  const dir = join(projectKitsDir(project), 'acme');
  assert.deepEqual(created, {
    id: 'acme',
    path: dir,
    source: { type: 'npm', package: '@acme/ui', version: '1.2.0' },
    skipped: [],
  });
  assert.deepEqual(readKitJson(project, 'acme'), {
    schemaVersion: 1,
    id: 'acme',
    name: 'acme',
    version: '1.2.0',
    source: { type: 'npm', package: '@acme/ui', version: '1.2.0' },
    framework: 'react',
    runtime: {
      packages: [
        { name: '@acme/ui', version: '1.2.0' },
        { name: 'react', version: '19.3.1' },
        { name: 'react-dom', version: '19.3.1' },
      ],
      entry: 'generated/kit.ts',
      styles: { files: [], generated: 'none', imports: [] },
      providers: [],
      clientOnly: false,
    },
    tokens: { file: 'json/tokens.json', format: 'dtcg-2025.10' },
    components: [],
    gaps: [],
  });
  assert.equal(readFileSync(join(dir, 'json', 'tokens.json'), 'utf8'), '{}\n');
  assert.equal(
    readFileSync(join(dir, 'generated', 'kit.ts'), 'utf8'),
    '// Written by kitvas from kit.json; do not edit. "kitvas kit verify" writes it again.\n',
  );
  // The skeleton has no components yet, so it is not a valid kit until the learner fills it.
  assert.throws(
    () => loadKit(layeredStore(project), 'acme'),
    (error: unknown) =>
      error instanceof KitvasError &&
      error.code === 'KIT_INVALID' &&
      String(error.params.detail).startsWith('components'),
  );
});

test('a repo kit names its folder and is version 0.0.0', () => {
  const project = tempProject(
    { 'src/ds/Button.tsx': 'export {};' },
    { react: { version: '18.3.1' } },
  );
  const created = newKit(deps(project), 'firma', { type: 'repo', value: 'src/ds' });
  assert.deepEqual(created.source, { type: 'repo', path: 'src/ds' });
  const kit = readKitJson(project, 'firma') as { version: string; runtime: { packages: unknown } };
  assert.equal(kit.version, '0.0.0');
  assert.deepEqual(kit.runtime.packages, [{ name: 'react', version: '18.3.1' }]);
});

test('an id that is taken in either layer is refused', () => {
  const project = tempProject({}, { '@acme/ui': { version: '1.2.0' } });
  const from = { type: 'npm', value: '@acme/ui' } as const;
  assert.throws(
    () => newKit(deps(project), 'tiny', from),
    fails('KIT_EXISTS', { id: 'tiny', where: 'built-in' }),
  );
  newKit(deps(project), 'acme', from);
  const where = join(projectKitsDir(project), 'acme');
  assert.throws(
    () => newKit(deps(project), 'acme', from),
    fails('KIT_EXISTS', { id: 'acme', where }),
  );
  writeProjectKit(project, { id: 'bad' });
  writeText(join(projectKitsDir(project), 'bad', 'kit.json'), '{not json');
  assert.throws(
    () => newKit(deps(project), 'bad', from),
    fails('KIT_EXISTS', { id: 'bad', where: join(projectKitsDir(project), 'bad') }),
  );
});

test('a package that is not installed, or no package name at all, is refused', () => {
  const project = tempProject();
  assert.throws(
    () => newKit(deps(project), 'acme', { type: 'npm', value: '@acme/ui' }),
    fails('KIT_PACKAGE_MISSING', { name: '@acme/ui' }),
  );
  for (const value of ['Not A Package', '@acme/ui/../../x', 'https://cdn.example/ui']) {
    assert.throws(
      () => newKit(deps(project), 'acme', { type: 'npm', value }),
      fails('KIT_SOURCE_INVALID'),
    );
  }
  assert.equal(existsSync(join(projectKitsDir(project), 'acme')), false);
});

test('a folder that does not exist or is not a project path is refused', () => {
  const project = tempProject({ 'src/ds/Button.tsx': '' });
  for (const value of ['src/nope', '../outside', 'C:/Windows', 'node_modules/@acme/ui']) {
    assert.throws(
      () => newKit(deps(project), 'firma', { type: 'repo', value }),
      fails('KIT_SOURCE_INVALID'),
      value,
    );
  }
});

test('an id that is not a kit id is refused before anything is read', () => {
  assert.throws(
    () => newKit(deps(tempProject()), 'Acme UI', { type: 'npm', value: '@acme/ui' }),
    fails('KIT_INVALID'),
  );
});

test('Tailwind 3 and 4 pass for a repo kit and for a package that uses it', () => {
  for (const version of ['3.4.17', '4.3.5']) {
    const project = tempProject(
      { 'src/ds/Button.tsx': '' },
      {
        tailwindcss: { version },
        '@acme/tw': { version: '2.0.0', peerDependencies: { tailwindcss: '>=3' } },
      },
    );
    assert.equal(newKit(deps(project), 'firma', { type: 'repo', value: 'src/ds' }).id, 'firma');
    assert.equal(newKit(deps(project), 'tw', { type: 'npm', value: '@acme/tw' }).id, 'tw');
  }
});

test('Tailwind 2 is refused for the project folder and for packages that use it', () => {
  const v3 = { tailwindcss: { version: '2.2.19' } };
  const project = tempProject(
    { 'src/ds/Button.tsx': '' },
    {
      ...v3,
      '@acme/ui': { version: '1.2.0' },
      '@acme/tw': { version: '2.0.0', peerDependencies: { tailwindcss: '>=3' } },
    },
  );
  assert.throws(
    () => newKit(deps(project), 'firma', { type: 'repo', value: 'src/ds' }),
    (error: unknown) =>
      error instanceof KitvasError &&
      error.code === 'KIT_SOURCE_INVALID' &&
      error.params.detail ===
        'the project has Tailwind CSS 2.2.19; kitvas builds with Tailwind 3 or 4',
  );
  assert.throws(
    () => newKit(deps(project), 'tw', { type: 'npm', value: '@acme/tw' }),
    fails('KIT_SOURCE_INVALID'),
  );
  assert.equal(newKit(deps(project), 'acme', { type: 'npm', value: '@acme/ui' }).id, 'acme');

  const v4 = tempProject({ 'src/ds/Button.tsx': '' }, { tailwindcss: { version: '4.3.5' } });
  assert.equal(newKit(deps(v4), 'firma', { type: 'repo', value: 'src/ds' }).id, 'firma');
});
