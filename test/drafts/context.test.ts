import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { sectionContext } from '../../src/drafts/index.ts';
import { createFolderKitStore } from '../../src/kit/adapters/folder-store.ts';
import { KitvasError } from '../../src/shared/index.ts';
import { GOOD_LAYOUT, shopDraft } from '../helpers/drafts.ts';
import { copyKit, FIXTURE_KITS, tinyKitJson } from '../helpers/kits.ts';

const kits = createFolderKitStore(FIXTURE_KITS);

test('gives one section everything it needs and nothing else', () => {
  const { store, root } = shopDraft();
  store.writeText('shop', 'v1/md/layout.md', GOOD_LAYOUT);
  const context = sectionContext(store, kits, 'shop', 'order-summary');
  assert.deepEqual(context.draft, { slug: 'shop', title: 'Shop', version: 1 });
  assert.deepEqual(context.section, {
    id: 'order-summary',
    component: 'OrderSummary',
    purpose: 'List what the user pays for.',
    components: ['Button', 'Icon'],
  });
  assert.deepEqual(context.outline, [
    { id: 'hero', purpose: 'Say what the shop sells.' },
    { id: 'order-summary', purpose: 'List what the user pays for.' },
  ]);
  assert.match(context.brief, /^# Brief: Shop\n/);
  assert.equal(context.states.default, 'filled');
  assert.equal(context.kit.id, 'tiny');
  assert.deepEqual(
    context.kit.components.map((component) => component.name),
    ['Button', 'Icon'],
  );
  assert.equal(context.kit.tokens.length, 8);
  assert.ok(context.kit.tokens.includes('--kit-color-ink'));
  assert.deepEqual(context.kit.icons, ['check', 'close']);
  assert.equal(context.styling, 'sheets');
  assert.equal('classes' in context, false);
  const src = join(root, 'shop', 'v1', 'src');
  assert.deepEqual(context.files, {
    tsx: join(src, 'tsx', 'sections', 'OrderSummary.tsx'),
    scss: join(src, 'scss', 'sections', 'order-summary.scss'),
  });
});

test('a section lists only its own kit components', () => {
  const { store } = shopDraft();
  store.writeText('shop', 'v1/md/layout.md', GOOD_LAYOUT);
  const context = sectionContext(store, kits, 'shop', 'hero');
  assert.deepEqual(
    context.kit.components.map((component) => component.name),
    ['Button'],
  );
});

test('a Tailwind kit says so and names the theme variables its tokens map onto', () => {
  const root = copyKit('tiny');
  const kit = tinyKitJson() as {
    runtime: { styles: Record<string, unknown> };
    tokens: Record<string, unknown>;
  };
  kit.runtime.styles.tailwind = { entry: 'src/app/globals.css' };
  kit.tokens.cssVars = { prefix: 'kit', map: 'json/css-var-map.json' };
  writeFileSync(join(root, 'tiny', 'kit.json'), JSON.stringify(kit, null, 2));
  // Two tokens on one variable give it once.
  writeFileSync(
    join(root, 'tiny', 'json', 'css-var-map.json'),
    JSON.stringify({
      'color.ink': '--color-ink',
      'space.sm': '--spacing',
      'color.accent': '--color-ink',
    }),
  );
  const { store } = shopDraft();
  store.writeText('shop', 'v1/md/layout.md', GOOD_LAYOUT);
  const context = sectionContext(store, createFolderKitStore(root), 'shop', 'hero');
  assert.equal(context.styling, 'tailwind');
  assert.deepEqual(context.classes, ['--color-ink', '--spacing']);
  assert.deepEqual(Object.keys(context).slice(-3), ['styling', 'classes', 'files']);
});

test('an unknown section or a layout with problems is an error', () => {
  const { store } = shopDraft();
  assert.throws(
    () => sectionContext(store, kits, 'shop', 'hero'),
    (error: unknown) =>
      error instanceof KitvasError &&
      error.code === 'DRAFT_INVALID' &&
      error.params.detail === 'layout',
  );
  store.writeText('shop', 'v1/md/layout.md', GOOD_LAYOUT);
  assert.throws(
    () => sectionContext(store, kits, 'shop', 'footer'),
    (error: unknown) =>
      error instanceof KitvasError &&
      error.code === 'SECTION_NOT_FOUND' &&
      error.params.section === 'footer',
  );
});
