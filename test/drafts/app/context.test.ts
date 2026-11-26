import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { saveSectionContext, sectionContext } from '../../../src/drafts/index.ts';
import { createFolderKitStore } from '../../../src/kit/adapters/folder-store.ts';
import { KitvasError } from '../../../src/shared/index.ts';
import { GOOD_LAYOUT, shopDraft } from '../../helpers/draft/drafts.ts';
import { copyKit, FIXTURE_KITS, tinyKitJson } from '../../helpers/kit/kits.ts';

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
  assert.deepEqual(context.kit.references, []);
  assert.equal(context.shared, '');
  assert.deepEqual(context.kit.icons, ['check', 'close']);
  assert.equal(context.styling, 'sheets');
  assert.equal('classes' in context, false);
  const src = join(root, 'shop', 'v1', 'src');
  assert.deepEqual(context.files, {
    tsx: join(src, 'tsx', 'sections', 'OrderSummary.tsx'),
    scss: join(src, 'scss', 'sections', 'order-summary.scss'),
  });
});

test('tokens come with the value CSS reads and the group of their path', () => {
  const { store } = shopDraft();
  store.writeText('shop', 'v1/md/layout.md', GOOD_LAYOUT);
  const { tokens } = sectionContext(store, kits, 'shop', 'hero').kit;
  const byName = new Map(tokens.map((token) => [token.name, token]));
  assert.deepEqual(byName.get('--kit-color-ink'), {
    name: '--kit-color-ink',
    type: 'color',
    value: '#1d2025',
    group: 'color',
  });
  assert.equal(byName.get('--kit-color-accent')?.value, '#1d2025');
  assert.equal(byName.get('--kit-color-veil')?.value, 'rgb(0 0 0 / 0.5)');
  assert.deepEqual(byName.get('--kit-space-sm'), {
    name: '--kit-space-sm',
    type: 'dimension',
    value: '8px',
    group: 'space',
  });
  assert.equal(byName.get('--kit-space-none')?.value, '0');
  assert.equal(byName.get('--kit-font-body')?.value, 'Inter, "Segoe UI", sans-serif');
  assert.equal(byName.get('--kit-font-weight-bold')?.value, '700');
  assert.equal(byName.get('--kit-font-weight-bold')?.group, 'font');
  assert.deepEqual(byName.get('--kit-motion-fast'), {
    name: '--kit-motion-fast',
    type: 'duration',
    value: '120ms',
    group: 'motion',
  });
});

test('references list only the images of the section components that exist', () => {
  const root = copyKit('tiny');
  const kit = tinyKitJson() as { components: { examples?: Record<string, unknown>[] }[] };
  const [button, icon] = kit.components;
  assert.ok(button?.examples?.[0] && icon);
  button.examples[0].reference = 'source/refs/Button.1.png';
  button.examples.push({
    title: 'Plain',
    code: '<Button variant="plain">Skip</Button>',
    imports: ['Button'],
    reference: 'source/refs/Button.2.png',
  });
  writeFileSync(join(root, 'tiny', 'kit.json'), JSON.stringify(kit, null, 2));
  mkdirSync(join(root, 'tiny', 'source', 'refs'), { recursive: true });
  writeFileSync(join(root, 'tiny', 'source', 'refs', 'Button.1.png'), 'png');
  const { store } = shopDraft();
  store.writeText('shop', 'v1/md/layout.md', GOOD_LAYOUT);
  const context = sectionContext(store, createFolderKitStore(root), 'shop', 'hero');
  assert.deepEqual(context.kit.references, [
    {
      component: 'Button',
      example: 'Solid',
      path: join(root, 'tiny', 'source', 'refs', 'Button.1.png'),
    },
  ]);
});

test('the shared block of the layout is passed on as written', () => {
  const { store } = shopDraft();
  store.writeText(
    'shop',
    'v1/md/layout.md',
    `${GOOD_LAYOUT}\n## shared\n<!-- note -->\nPage width: 1200px.\n\n  Hero owns the cart state.\n`,
  );
  const context = sectionContext(store, kits, 'shop', 'hero');
  assert.equal(context.shared, 'Page width: 1200px.\n\n  Hero owns the cart state.');
  assert.deepEqual(
    context.outline.map((entry) => entry.id),
    ['hero', 'order-summary'],
  );
});

test('saving writes the context file of the version and answers its path', () => {
  const { store, root } = shopDraft();
  store.writeText('shop', 'v1/md/layout.md', GOOD_LAYOUT);
  const saved = saveSectionContext(store, kits, 'shop', 'hero');
  const path = join(root, 'shop', 'v1', 'build', 'context', 'hero.json');
  assert.deepEqual(saved, { section: 'hero', path });
  const written: unknown = JSON.parse(readFileSync(path, 'utf8'));
  assert.deepEqual(written, sectionContext(store, kits, 'shop', 'hero'));
  assert.throws(
    () => saveSectionContext(store, kits, 'shop', 'footer'),
    (error: unknown) => error instanceof KitvasError && error.code === 'SECTION_NOT_FOUND',
  );
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
