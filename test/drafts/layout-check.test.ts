import assert from 'node:assert/strict';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { addVersion, checkLayout } from '../../src/drafts/index.ts';
import { createFolderKitStore } from '../../src/kit/adapters/folder-store.ts';
import { KitvasError } from '../../src/shared/index.ts';
import { GOOD_LAYOUT, NOW, shopDraft } from '../helpers/drafts.ts';
import { FIXTURE_KITS } from '../helpers/kits.ts';

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
