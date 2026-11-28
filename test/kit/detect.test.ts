import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createProjectFiles } from '../../src/kit/adapters/project-files.ts';
import { detectKits, loadKit } from '../../src/kit/index.ts';
import { layeredStore, npmKitJson, tempProject, writeProjectKit } from './helpers/project-kit.ts';

const tsxFiles = (folder: string, count: number): Record<string, string> =>
  Object.fromEntries(
    Array.from({ length: count }, (_, index) => [
      `${folder}/Part${index}.tsx`,
      'export const Part = () => null;',
    ]),
  );

const detect = (
  project: string,
  options: { hashes?: Record<string, string>; activeKit?: string } = {},
) =>
  detectKits({
    kits: layeredStore(project),
    files: createProjectFiles(project),
    verifiedHash: (id) => options.hashes?.[id],
    activeKit: options.activeKit ?? 'kitvas-ui',
  });

test('a components folder of 12 tsx files and @mui/material are both signs', () => {
  const project = tempProject({
    ...tsxFiles('components', 12),
    'package.json': JSON.stringify({
      dependencies: { react: '19.0.0', '@mui/material': '6.0.0' },
    }),
  });
  assert.deepEqual(detect(project), {
    kits: [],
    active: null,
    signs: { components: ['components'], packages: ['@mui/material'], figma: [] },
  });
});

test('nine files are not a sign, ten of any kind are, and nested files count', () => {
  const project = tempProject({
    ...tsxFiles('src/components', 9),
    ...tsxFiles('src/ui/forms', 10),
    ...Object.fromEntries(
      Array.from({ length: 5 }, (_, i) => [`src/app/components/f${i}.html`, '<p></p>']),
    ),
    ...Object.fromEntries(
      Array.from({ length: 5 }, (_, i) => [`src/app/components/f${i}.css`, 'p{}']),
    ),
  });
  assert.deepEqual(detect(project).signs.components, ['src/ui', 'src/app/components']);
});

test('template folders of other technologies are signs, and Angular counts only its component files', () => {
  const files = (folder: string, count: number, name: (i: number) => string) =>
    Object.fromEntries(Array.from({ length: count }, (_, i) => [`${folder}/${name(i)}`, 'x']));
  const project = tempProject({
    ...files('resources/views/components', 10, (i) => `c${i}.blade.php`),
    ...files('layouts/partials', 10, (i) => `p${i}.html`),
    ...files('src/partials', 10, (i) => `p${i}.hbs`),
    // Four Angular components of three files each, beside routes and services that do not count.
    ...files(
      'src/app',
      12,
      (i) => `part${Math.floor(i / 3)}/part.component.${['ts', 'html', 'css'][i % 3]}`,
    ),
    ...files('src/app', 9, (i) => `app.routes${i}.ts`),
  });
  assert.deepEqual(detect(project).signs.components, [
    'src/partials',
    'resources/views/components',
    'layouts/partials',
    'src/app',
  ]);
  // Nine component files in src/app, and a Next app folder of pages, are no sign.
  const next = tempProject({
    ...files('src/app', 9, (i) => `part${i}/part.component.ts`),
    ...files('app', 12, (i) => `route${i}/page.tsx`),
  });
  assert.deepEqual(detect(next).signs.components, []);
});

test('Angular components under src/app/components are one sign, not two', () => {
  const project = tempProject(
    Object.fromEntries(
      Array.from({ length: 12 }, (_, i) => [`src/app/components/c${i}.component.ts`, 'x']),
    ),
  );
  assert.deepEqual(detect(project).signs.components, ['src/app/components']);
});

test('a folder of dot files is not a sign', () => {
  const project = tempProject(
    Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`app/components/.f${i}`, 'x'])),
  );
  assert.deepEqual(detect(project).signs.components, []);
});

test('each kit carries the components that are out of date', () => {
  const project = tempProject();
  writeProjectKit(project, npmKitJson());
  const found = detectKits({
    kits: layeredStore(project),
    files: createProjectFiles(project),
    verifiedHash: () => undefined,
    activeKit: 'acme',
    outdated: (id) => (id === 'acme' ? ['Button'] : []),
  });
  assert.deepEqual(found.kits[0]?.outdated, ['Button']);
});

test('devDependencies count and the packages come back sorted', () => {
  const project = tempProject({
    'package.json': JSON.stringify({
      dependencies: { antd: '5.0.0' },
      devDependencies: { '@chakra-ui/react': '3.0.0', vite: '7.0.0' },
    }),
  });
  assert.deepEqual(detect(project).signs.packages, ['@chakra-ui/react', 'antd']);
});

test('a project kit is listed with its source and is fresh when its hash was verified', () => {
  const project = tempProject();
  writeProjectKit(project, npmKitJson());
  const { hash } = loadKit(layeredStore(project), 'acme');
  const found = detect(project, { hashes: { acme: hash }, activeKit: 'acme' });
  assert.deepEqual(found.kits, [{ id: 'acme', source: 'npm', stale: false, outdated: [] }]);
  assert.equal(found.active, 'acme');
});

test('a project kit is stale when verify recorded another hash or none', () => {
  const project = tempProject();
  writeProjectKit(project, npmKitJson());
  assert.deepEqual(detect(project, { hashes: { acme: '0'.repeat(64) } }).kits, [
    { id: 'acme', source: 'npm', stale: true, outdated: [] },
  ]);
  assert.deepEqual(detect(project).kits, [
    { id: 'acme', source: 'npm', stale: true, outdated: [] },
  ]);
});

test('built-in kits are not listed, and the active kit must exist', () => {
  const project = tempProject();
  const found = detect(project, { activeKit: 'tiny' });
  assert.deepEqual(found.kits, []);
  assert.equal(found.active, 'tiny');
  assert.equal(detect(project, { activeKit: 'missing' }).active, null);
});

test('no kits and no signs gives an empty answer', () => {
  const project = tempProject();
  assert.deepEqual(detect(project), {
    kits: [],
    active: null,
    signs: { components: [], packages: [], figma: [] },
  });
});

test('a package.json that is not JSON, or not an object, counts as no packages', () => {
  assert.deepEqual(
    detect(tempProject({ 'package.json': '{ "dependencies": ' })).signs.packages,
    [],
  );
  assert.deepEqual(detect(tempProject({ 'package.json': '[1, 2]' })).signs.packages, []);
  assert.deepEqual(
    detect(tempProject({ 'package.json': '{"dependencies": 4}' })).signs.packages,
    [],
  );
});

test('Figma design links in notes.md are signs, once each; other links are not', () => {
  const key = 'AbCdEfGhIjKlMnOpQrStUv';
  const link = `https://www.figma.com/design/${key}/Shop?node-id=1-2`;
  const project = tempProject({
    '.kitvas/notes.md': `Design: ${link}.\nAgain (${link}) and https://example.com/design/x\nhttps://www.figma.com/design/short/x`,
  });
  assert.deepEqual(detect(project).signs.figma, [link]);
});
