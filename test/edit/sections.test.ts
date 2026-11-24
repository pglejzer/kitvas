import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createDraft, type DraftStore } from '../../src/drafts/index.ts';
import {
  applySectionOp,
  type SectionDeps,
  type SectionOp,
  type SectionResult,
} from '../../src/edit/app/sections.ts';
import { applyHunks, makeHunks } from '../../src/edit/index.ts';
import { KitvasError } from '../../src/shared/index.ts';
import { NOW, readVersionFiles, shopDraft, TINY, writeVersionFiles } from '../helpers/drafts.ts';

type InsertOp = Extract<SectionOp, { op: 'insertSection' }>;

const LAYOUT = 'md/layout.md';
const HERO_BLOCK = ['## hero', 'Purpose: Say what the shop sells.', 'Components: Button'];
const PLANS_BLOCK = ['## plans', 'Purpose: Compare the plans.', 'Components: Card, Button'];
const SHOP_LAYOUT = ['# Layout: Shop', '', ...HERO_BLOCK, '', ...PLANS_BLOCK, ''].join('\n');

const section = (name: string, body: string): string =>
  [
    "import { Button, Card } from '@kit';",
    '',
    `export function ${name}() {`,
    '  return (',
    `    <section className="${name.toLowerCase()}">`,
    `      ${body}`,
    '    </section>',
    '  );',
    '}',
    '',
  ].join('\n');

const SHOP_FILES = {
  [LAYOUT]: SHOP_LAYOUT,
  'src/tsx/sections/Hero.tsx': section('Hero', '<Button>Buy</Button>'),
  'src/scss/sections/hero.scss': '.hero {\n  gap: var(--kit-space-md);\n}\n',
  'src/tsx/sections/Plans.tsx': section('Plans', '<Card>Basic</Card>'),
  'src/scss/sections/plans.scss': '.plans {\n  display: grid;\n}\n',
};
const PATHS = Object.keys(SHOP_FILES);

/** The section of the other draft: its SCSS is a partial, and its text says "Plans" too. */
const ABOUT_BLOCK = ['## plans', 'Purpose: Show the prices.', 'Components: Card'];
const ABOUT_PLANS = section('Plans', '<Card>Plans from 9 euros</Card>');
const ABOUT_SCSS = '.plans {\n  padding: var(--kit-space-lg);\n}\n';
const ABOUT_FILES = {
  [LAYOUT]: ['# Layout: About', '', ...ABOUT_BLOCK, ''].join('\n'),
  'src/tsx/sections/Plans.tsx': ABOUT_PLANS,
  'src/scss/sections/_plans.scss': ABOUT_SCSS,
};

const KIT: ReadonlySet<string> = new Set(['Button', 'Card', 'Icon']);
const INSERT: InsertOp = {
  op: 'insertSection',
  from: { slug: 'about', section: 'plans' },
  after: 'hero',
};

/** The `shop` draft and the `about` draft of the same kit, both at version 1. */
function setup(kitNames: ReadonlySet<string> = KIT) {
  const { store } = shopDraft();
  writeVersionFiles(store, 'shop', 1, SHOP_FILES);
  createDraft(store, { slug: 'about', title: 'About', kit: TINY, now: NOW });
  writeVersionFiles(store, 'about', 1, ABOUT_FILES);
  const deps: SectionDeps = { drafts: store, kitNames: () => kitNames };
  const apply = (op: SectionOp, slug = 'shop'): SectionResult =>
    applySectionOp(deps, slug, 1, op, (file) => store.readText(slug, `v1/${file}`));
  return { store, deps, apply };
}

/** The new texts of an applied op, by path inside the version. */
function filesOf(result: SectionResult): Record<string, string | null> {
  assert.ok('files' in result, JSON.stringify(result));
  return Object.fromEntries(
    result.files.map(({ file, text }): [string, string | null] => [file, text]),
  );
}

/** Writes texts into `shop` v1 at once, as the request does (`null` removes the file). */
function write(store: DraftStore, files: Record<string, string | null | undefined>): void {
  store.replaceAll(
    'shop',
    Object.entries(files).map(([file, text]) => ({ relPath: `v1/${file}`, text: text ?? null })),
  );
}

test('moving the first section last and back gives the layout byte for byte', () => {
  const { store, apply } = setup();
  const there = filesOf(apply({ op: 'moveSection', section: 'hero', after: 'plans' }));
  assert.deepEqual(there, {
    [LAYOUT]: ['# Layout: Shop', '', ...PLANS_BLOCK, '', ...HERO_BLOCK, ''].join('\n'),
  });
  write(store, there);
  const back = filesOf(apply({ op: 'moveSection', section: 'hero', after: null }));
  assert.deepEqual(back, { [LAYOUT]: SHOP_LAYOUT });
  write(store, back);
  assert.deepEqual(readVersionFiles(store, 'shop', 1, PATHS), SHOP_FILES);
});

test('a move to where the section is changes nothing; an unknown section is not found', () => {
  const { apply } = setup();
  assert.deepEqual(apply({ op: 'moveSection', section: 'hero', after: null }), { files: [] });
  assert.deepEqual(apply({ op: 'moveSection', section: 'nope', after: null }), {
    refused: 'not-found',
  });
  assert.deepEqual(apply({ op: 'moveSection', section: 'hero', after: 'nope' }), {
    refused: 'not-found',
  });
});

test('an inserted section with a taken id gets plans-2 in its layout, files and component', () => {
  const { store, apply } = setup();
  const inserted = filesOf(apply(INSERT));
  assert.deepEqual(inserted, {
    [LAYOUT]: [
      '# Layout: Shop',
      '',
      ...HERO_BLOCK,
      '',
      '## plans-2',
      'Purpose: Show the prices.',
      'Components: Card',
      '',
      ...PLANS_BLOCK,
      '',
    ].join('\n'),
    // The component follows the id; the text that says "Plans" stays.
    'src/tsx/sections/Plans2.tsx': ABOUT_PLANS.replace(
      'export function Plans()',
      'export function Plans2()',
    ),
    // A partial stays a partial.
    'src/scss/sections/_plans-2.scss': ABOUT_SCSS,
  });
  write(store, inserted);
  // The next copy counts on.
  const again = filesOf(apply({ ...INSERT, after: null }));
  assert.match(again[LAYOUT] ?? '', /^## plans-3$/m);
  assert.match(again['src/tsx/sections/Plans3.tsx'] ?? '', /export function Plans3\(\)/);
  assert.equal(again['src/scss/sections/_plans-3.scss'], ABOUT_SCSS);
});

test('a section of another kit, or naming what this kit lacks, is kit-mismatch', () => {
  const { store, apply } = setup();
  createDraft(store, { slug: 'other', title: 'Other', kit: { ...TINY, id: 'base' }, now: NOW });
  writeVersionFiles(store, 'other', 1, ABOUT_FILES);
  assert.deepEqual(apply({ ...INSERT, from: { slug: 'other', section: 'plans' } }), {
    refused: 'kit-mismatch',
  });
  // `Card` is not in this draft's kit, as an addition only the other draft saw would not be.
  assert.deepEqual(setup(new Set(['Button'])).apply(INSERT), { refused: 'kit-mismatch' });
});

test('a section that imports another file of its draft is refused with scope', () => {
  const { store, apply } = setup();
  writeVersionFiles(store, 'about', 1, {
    'src/tsx/sections/Plans.tsx': `import { prices } from '../data/prices.ts';\n${ABOUT_PLANS}`,
  });
  assert.deepEqual(apply(INSERT), { refused: 'scope' });
});

test('an unknown draft, section or place to insert after is not found', () => {
  const { apply } = setup();
  const unknown: InsertOp[] = [
    { ...INSERT, from: { slug: 'nope', section: 'plans' } },
    { ...INSERT, from: { slug: 'about', section: 'nope' } },
    { ...INSERT, after: 'nope' },
  ];
  for (const op of unknown) assert.deepEqual(apply(op), { refused: 'not-found' });
});

test('removing a section takes its block and files; the server inverse brings them back', () => {
  const { store, apply } = setup();
  const before = readVersionFiles(store, 'shop', 1, PATHS);
  const removed = filesOf(apply({ op: 'removeSection', section: 'plans' }));
  assert.deepEqual(removed, {
    [LAYOUT]: ['# Layout: Shop', '', ...HERO_BLOCK, ''].join('\n'),
    'src/tsx/sections/Plans.tsx': null,
    'src/scss/sections/plans.scss': null,
  });
  write(store, removed);
  assert.equal(store.exists('shop', 'v1/src/tsx/sections/Plans.tsx'), false);
  assert.equal(store.exists('shop', 'v1/src/scss/sections/plans.scss'), false);

  // The inverse the request answers with (task B3): a patch of the layout, `file` ops for the rest.
  const now = store.readText('shop', `v1/${LAYOUT}`) ?? '';
  const patched = applyHunks(now, makeHunks(before[LAYOUT] ?? '', now));
  assert.ok('text' in patched);
  write(store, {
    [LAYOUT]: patched.text,
    'src/tsx/sections/Plans.tsx': before['src/tsx/sections/Plans.tsx'],
    'src/scss/sections/plans.scss': before['src/scss/sections/plans.scss'],
  });
  assert.deepEqual(readVersionFiles(store, 'shop', 1, PATHS), before);
});

test('the last section of a layout is not removed: the draft would not build', () => {
  const { store, apply } = setup();
  write(store, filesOf(apply({ op: 'removeSection', section: 'plans' })));
  assert.deepEqual(apply({ op: 'removeSection', section: 'hero' }), { refused: 'invalid' });
  assert.deepEqual(apply({ op: 'removeSection', section: 'plans' }), { refused: 'not-found' });
});

test('a craft draft has no sections, and an older version is stale', () => {
  const { store, deps, apply } = setup();
  createDraft(store, {
    slug: 'star',
    title: 'Star',
    kit: TINY,
    now: NOW,
    kind: 'craft',
    craft: { subject: 'icon', name: 'Star', description: 'A star.' },
  });
  assert.deepEqual(apply({ op: 'removeSection', section: 'hero' }, 'star'), {
    refused: 'invalid',
  });
  const read = (file: string): string | undefined => store.readText('shop', `v1/${file}`);
  assert.throws(
    () => applySectionOp(deps, 'shop', 2, { op: 'removeSection', section: 'hero' }, read),
    (error: unknown) => error instanceof KitvasError && error.code === 'EDIT_STALE_VERSION',
  );
});
