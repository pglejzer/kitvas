import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { craftBriefTemplate } from '../../../src/drafts/domain/templates.ts';
import {
  type CraftSubject,
  craftContext,
  createDraft,
  type DraftStore,
  saveCraftContext,
} from '../../../src/drafts/index.ts';
import { createFolderKitStore } from '../../../src/kit/adapters/folder-store.ts';
import { KitvasError } from '../../../src/shared/index.ts';
import { NOW, shopDraft, TINY, tempDrafts } from '../../helpers/draft/drafts.ts';
import { FIXTURE_KITS } from '../../helpers/kit/kits.ts';

const kits = createFolderKitStore(FIXTURE_KITS);

function craftDraft(subject: CraftSubject): { store: DraftStore; root: string } {
  const drafts = tempDrafts();
  createDraft(drafts.store, {
    slug: 'spark',
    title: 'Spark',
    kit: TINY,
    now: NOW,
    kind: 'craft',
    craft: { subject, name: 'Spark', description: 'A mark for the Spark shop.' },
  });
  return drafts;
}

test('a logo draft gets a brief of a logo, not of a screen', () => {
  const { store } = craftDraft('logo');
  const brief = store.readText('spark', 'v1/md/brief.md') ?? '';
  assert.match(brief, /^# Brief: Spark\n/);
  assert.match(brief, /^## Goal$/m);
  assert.match(brief, /^## Name$/m);
  assert.match(brief, /^## Uses$/m);
  assert.match(brief, /^## Example$/m);
  assert.doesNotMatch(brief, /^## (Audience|Content|States)$/m);
  assert.doesNotMatch(brief, /screen/);
});

test('each subject has its own headings', () => {
  const heads = (subject: CraftSubject): string[] =>
    [...craftBriefTemplate('Spark', subject).matchAll(/^## (.+)$/gm)].map(
      (match) => match[1] ?? '',
    );
  assert.deepEqual(heads('logo'), ['Goal', 'Name', 'Uses', 'Example']);
  assert.deepEqual(heads('icon'), ['Goal', 'Uses', 'Example']);
  assert.deepEqual(heads('component'), ['Goal', 'Content', 'States', 'Example']);
});

test('a screen draft keeps the brief of a screen', () => {
  const { store } = shopDraft();
  assert.match(store.readText('shop', 'v1/md/brief.md') ?? '', /^## Audience$/m);
});

test('a logo context holds the kit facts, the brief and the files, and no catalog', () => {
  const { store, root } = craftDraft('logo');
  const context = craftContext(store, kits, 'spark');
  assert.deepEqual(context.draft, { slug: 'spark', title: 'Spark', version: 1 });
  assert.deepEqual(context.craft, {
    subject: 'logo',
    name: 'Spark',
    description: 'A mark for the Spark shop.',
    picked: null,
  });
  assert.match(context.brief, /^# Brief: Spark\n/);
  assert.equal(context.kit.id, 'tiny');
  assert.equal(context.kit.tokens.length, 8);
  assert.deepEqual(
    context.kit.tokens.find((token) => token.name === '--kit-color-ink'),
    { name: '--kit-color-ink', type: 'color', value: '#1d2025', group: 'color' },
  );
  assert.deepEqual(context.kit.components, []);
  assert.deepEqual(context.kit.icons, { component: 'Icon', names: ['check', 'close'] });
  assert.equal(context.styling, 'sheets');
  assert.equal('classes' in context, false);
  const base = join(root, 'spark', 'v1');
  assert.deepEqual(
    context.files,
    (['A', 'B', 'C'] as const).map((sketch) => ({
      sketch,
      tsx: join(base, 'src', 'tsx', 'sketches', `${sketch}.tsx`),
      why: join(base, 'why', `${sketch}.json`),
    })),
  );
  assert.deepEqual(context.locked, []);
});

test('an icon context holds the icon component alone, a component context the whole catalog', () => {
  const icon = craftDraft('icon');
  assert.deepEqual(
    craftContext(icon.store, kits, 'spark').kit.components.map((component) => component.name),
    ['Icon'],
  );
  const component = craftDraft('component');
  const names = craftContext(component.store, kits, 'spark').kit.components.map(
    (each) => each.name,
  );
  assert.ok(names.includes('Button') && names.includes('Icon'));
});

test('the context is saved beside the build, and its path comes back', () => {
  const { store, root } = craftDraft('logo');
  const saved = saveCraftContext(store, kits, 'spark');
  assert.equal(saved.path, join(root, 'spark', 'v1', 'build', 'context', 'craft.json'));
  const read: unknown = JSON.parse(readFileSync(saved.path, 'utf8'));
  assert.deepEqual(read, craftContext(store, kits, 'spark'));
});

test('a draft that is no craft draft has no craft context', () => {
  const { store } = shopDraft();
  assert.throws(
    () => craftContext(store, kits, 'shop'),
    (error) => error instanceof KitvasError && error.code === 'DRAFT_KIND',
  );
});
