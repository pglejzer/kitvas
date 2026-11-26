import assert from 'node:assert/strict';
import { readFileSync, rmSync, statSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { addVersion, checkLayout } from '../../../src/drafts/index.ts';
import { createFolderKitStore } from '../../../src/kit/adapters/folder-store.ts';
import { KitvasError } from '../../../src/shared/index.ts';
import { GOOD_LAYOUT, NOW, shopDraft } from '../../helpers/draft/drafts.ts';
import { FIXTURE_KITS, themedTiny } from '../../helpers/kit/kits.ts';

const kits = createFolderKitStore(FIXTURE_KITS);

test('a fresh draft has no sections yet and nothing is generated', () => {
  const { store } = shopDraft();
  const report = checkLayout(store, kits, 'shop');
  assert.equal(report.valid, false);
  assert.deepEqual(
    report.issues.map((issue) => issue.key),
    ['draftIssue.noSections'],
  );
  assert.deepEqual(report.generated, []);
  assert.equal(store.exists('shop', 'v1/src/tsx/index.tsx'), false);
});

test('a valid layout writes the entry files and lists the section files', () => {
  const { store, root } = shopDraft();
  store.writeText('shop', 'v1/md/layout.md', GOOD_LAYOUT);
  store.writeText('shop', 'v1/src/tsx/sections/Hero.tsx', 'export const Hero = () => null;\n');
  store.writeText('shop', 'v1/src/scss/sections/hero.scss', '');
  const report = checkLayout(store, kits, 'shop');
  assert.deepEqual(report, {
    slug: 'shop',
    version: 1,
    valid: true,
    issues: [],
    sections: [
      {
        id: 'hero',
        component: 'Hero',
        tsx: 'v1/src/tsx/sections/Hero.tsx',
        scss: 'v1/src/scss/sections/hero.scss',
        written: true,
      },
      {
        id: 'order-summary',
        component: 'OrderSummary',
        tsx: 'v1/src/tsx/sections/OrderSummary.tsx',
        scss: 'v1/src/scss/sections/order-summary.scss',
        written: false,
      },
    ],
    generated: ['v1/src/tsx/index.tsx', 'v1/src/scss/index.scss'],
  });
  const dir = join(root, 'shop', 'v1', 'src');
  assert.match(
    readFileSync(join(dir, 'tsx', 'index.tsx'), 'utf8'),
    /<OrderSummary state=\{state\} \/>/,
  );
  assert.match(readFileSync(join(dir, 'scss', 'index.scss'), 'utf8'), /@use 'sections\/hero';/);
});

test('a check that changes nothing leaves the entry files as they are, time and all', () => {
  // A build checks the layout each time; the start page orders drafts by their newest source file.
  const { store, root } = shopDraft();
  store.writeText('shop', 'v1/md/layout.md', GOOD_LAYOUT);
  checkLayout(store, kits, 'shop');
  const files = ['tsx/index.tsx', 'scss/index.scss'].map((name) =>
    join(root, 'shop', 'v1', 'src', name),
  );
  const then = new Date('2026-01-02T03:04:05.000Z');
  for (const file of files) utimesSync(file, then, then);
  const report = checkLayout(store, kits, 'shop');
  assert.deepEqual(report.generated, ['v1/src/tsx/index.tsx', 'v1/src/scss/index.scss']);
  for (const file of files) assert.equal(statSync(file).mtimeMs, then.getTime(), file);
  // A layout that changed is written again.
  store.writeText('shop', 'v1/md/layout.md', GOOD_LAYOUT.replace('## order-summary', '## basket'));
  checkLayout(store, kits, 'shop');
  assert.match(readFileSync(files[0] ?? '', 'utf8'), /<Basket state=\{state\} \/>/);
  assert.notEqual(statSync(files[0] ?? '').mtimeMs, then.getTime());
});

test('it works on the latest version', () => {
  const { store } = shopDraft();
  addVersion(store, 'shop', NOW);
  store.writeText('shop', 'v2/md/layout.md', GOOD_LAYOUT);
  const report = checkLayout(store, kits, 'shop');
  assert.equal(report.version, 2);
  assert.deepEqual(report.generated, ['v2/src/tsx/index.tsx', 'v2/src/scss/index.scss']);
});

test('problems of the layout, the kit and the states are all reported', () => {
  const { store, root } = shopDraft();
  store.writeText(
    'shop',
    'v1/md/layout.md',
    ['## hero', 'Purpose: x', 'Components: Button, Table'].join('\n'),
  );
  rmSync(join(root, 'shop', 'v1', 'src', 'json', 'states.json'));
  const report = checkLayout(store, kits, 'shop');
  assert.equal(report.valid, false);
  assert.deepEqual(
    report.issues.map((issue) => [issue.path, issue.key]),
    [
      ['layout.hero', 'draftIssue.unknownComponent'],
      ['states', 'draftIssue.statesInvalid'],
    ],
  );
  assert.deepEqual(report.generated, []);
});

const OPTIONS_JSON = JSON.stringify({
  schemaVersion: 1,
  options: [
    {
      id: 'columns',
      label: 'Columns',
      default: '3',
      values: [
        { id: '3', label: 'Three' },
        { id: '2', label: 'Two' },
      ],
    },
  ],
});

test('options write the type file and an entry that passes them on; removing them undoes it', () => {
  const { store } = shopDraft();
  store.writeText('shop', 'v1/md/layout.md', GOOD_LAYOUT);
  store.writeText('shop', 'v1/src/json/options.json', OPTIONS_JSON);
  const report = checkLayout(store, kits, 'shop');
  assert.deepEqual(report.generated, [
    'v1/src/tsx/index.tsx',
    'v1/src/scss/index.scss',
    'v1/src/tsx/options.ts',
  ]);
  assert.match(store.readText('shop', 'v1/src/tsx/options.ts') ?? '', /"columns": "3" \| "2"/);
  assert.match(store.readText('shop', 'v1/src/tsx/index.tsx') ?? '', /<Hero \{\.\.\.props\} \/>/);

  store.replaceAll('shop', [{ relPath: 'v1/src/json/options.json', text: null }]);
  const without = checkLayout(store, kits, 'shop');
  assert.deepEqual(without.generated, ['v1/src/tsx/index.tsx', 'v1/src/scss/index.scss']);
  assert.equal(store.exists('shop', 'v1/src/tsx/options.ts'), false);
  assert.match(store.readText('shop', 'v1/src/tsx/index.tsx') ?? '', /<Hero state=\{state\} \/>/);
});

test('the option theme is a problem while a kit has no themes', () => {
  const { store } = shopDraft();
  store.writeText('shop', 'v1/md/layout.md', GOOD_LAYOUT);
  store.writeText('shop', 'v1/src/json/options.json', OPTIONS_JSON.replaceAll('columns', 'theme'));
  const report = checkLayout(store, kits, 'shop');
  assert.equal(report.valid, false);
  assert.ok(report.issues.every((issue) => issue.key === 'draftIssue.optionsTheme'));
});

test("the option theme may name the kit's themes, and a value the kit lacks is a problem", () => {
  const themed = createFolderKitStore(themedTiny());
  const { store } = shopDraft();
  store.writeText('shop', 'v1/md/layout.md', GOOD_LAYOUT);
  const theme = (values: string[]) =>
    JSON.stringify({
      schemaVersion: 1,
      options: [
        {
          id: 'theme',
          label: 'Theme',
          default: 'light',
          values: values.map((id) => ({ id, label: id })),
        },
      ],
    });
  store.writeText('shop', 'v1/src/json/options.json', theme(['light', 'dark']));
  assert.deepEqual(checkLayout(store, themed, 'shop').issues, []);

  store.writeText('shop', 'v1/src/json/options.json', theme(['light', 'sepia']));
  assert.deepEqual(checkLayout(store, themed, 'shop').issues, [
    { path: 'options.theme.values', key: 'draftIssue.optionsTheme', params: { value: 'sepia' } },
  ]);
});

test('a missing layout.md is one issue; an unknown draft or kit is an error', () => {
  const { store, root } = shopDraft();
  rmSync(join(root, 'shop', 'v1', 'md', 'layout.md'));
  assert.deepEqual(
    checkLayout(store, kits, 'shop').issues.map((issue) => [issue.path, issue.key]),
    [['layout', 'draftIssue.layoutMissing']],
  );
  const code = (expected: string) => (error: unknown) =>
    error instanceof KitvasError && error.code === expected;
  assert.throws(() => checkLayout(store, kits, 'nope'), code('DRAFT_NOT_FOUND'));
  const noKits = createFolderKitStore(join(root, 'no-kits'));
  assert.throws(() => checkLayout(store, noKits, 'shop'), code('KIT_NOT_FOUND'));
});
