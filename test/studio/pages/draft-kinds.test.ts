import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  createDraft,
  type DraftStore,
  loadDraft,
  serializeJson,
} from '../../../src/drafts/index.ts';
import { createFolderKitStore } from '../../../src/kit/adapters/folder-store.ts';
import { readBeforeImage } from '../../../src/studio/pages/draft/before-files.ts';
import { escapeHtml } from '../../../src/studio/pages/html.ts';
import { pageRoutes } from '../../../src/studio/pages/routes.ts';
import { originalView } from '../../../src/studio/views/rework-view.ts';
import { NOW, shopDraft, TINY, tempDrafts } from '../../helpers/drafts.ts';
import { FIXTURE_KITS } from '../../helpers/kits.ts';
import { t } from '../../helpers/translate.ts';

type Ask = { params?: Record<string, string>; query?: string };

function pages(store: DraftStore) {
  const routes = pageRoutes({
    drafts: store,
    kits: createFolderKitStore(FIXTURE_KITS),
    t,
    skin: '/* skin */',
    frame: { port: 5001, key: 'k3y' },
    version: '1.0.0',
    projectKit: () => 'base',
  });
  return async (id: string, ask: Ask = {}): Promise<string> => {
    const route = routes.find((candidate) => candidate.id === id);
    assert.ok(route, id);
    const answer = await route.handle({
      params: ask.params ?? {},
      headers: {},
      query: new URLSearchParams(ask.query ?? ''),
      host: '127.0.0.1:5000',
      nonce: 'N0nce',
    });
    assert.equal(typeof answer, 'string');
    return answer as string;
  };
}

const build = (store: DraftStore, slug: string): void =>
  store.writeText(slug, 'v1/build/html/index.html', '<!doctype html>');

/** A rework draft with a saved original: a 390 px shot, two problems and an inventory. */
function reworkDraft(root: string, store: DraftStore, problems: boolean): void {
  createDraft(store, {
    slug: 'landing',
    title: 'Landing',
    kit: TINY,
    now: NOW,
    kind: 'rework',
    rework: { source: 'url' },
  });
  build(store, 'landing');
  const before = join(root, 'landing', 'before');
  mkdirSync(join(before, 'shots'), { recursive: true });
  writeFileSync(join(before, 'shots', '390.png'), Buffer.from([137, 80, 78, 71]));
  const source = {
    schemaVersion: 1,
    source: 'url',
    url: 'https://example.com/',
    files: [],
    capturedAt: NOW.toISOString(),
    widths: [390, 1280],
    measured: problems,
  };
  store.writeText('landing', 'before/source.json', serializeJson(source));
  store.writeText('landing', 'before/inventory.json', serializeJson({ items: [] }));
  if (problems) {
    store.writeText(
      'landing',
      'before/problems.json',
      serializeJson({ counts: { 'ui/tap-target': 3, 'a11y/contrast': 4 }, findings: [] }),
    );
  }
}

function craftDraft(store: DraftStore): void {
  createDraft(store, {
    slug: 'mark',
    title: 'Mark',
    kit: TINY,
    now: NOW,
    kind: 'craft',
    craft: { subject: 'logo', name: 'Mark', description: 'A mark for the shop.' },
  });
  build(store, 'mark');
}

test('the rework page offers the original and shows version 0 with its problem count', async () => {
  const { store, root } = tempDrafts();
  reworkDraft(root, store, true);
  const view = pages(store);
  const plain = await view('draft', { params: { slug: 'landing' } });
  // The compare menu offers the original, version 0, though the draft has one version.
  const original = escapeHtml(t('studio.draft.original'));
  assert.ok(
    plain.includes(
      `<a class="k-menu-item" href="/drafts/landing?version=1&amp;state=filled&amp;width=390&amp;compare=0"><span>${original}</span></a>`,
    ),
  );
  assert.ok(!plain.includes('data-card="original"'));
  assert.ok(!plain.includes('cmp-shot'));
  const text = await view('draft', { params: { slug: 'landing' }, query: 'compare=0' });
  // The original is a card of its own, named in its caption, before the version's card.
  assert.ok(text.includes(`<span class="card-name">${original}</span>`));
  assert.ok(text.indexOf('data-card="original"') < text.indexOf('data-card="current"'));
  assert.ok(text.includes(escapeHtml(t('studio.edit.shell.comparingOriginal'))));
  // The original is a comparison: Edit is off.
  assert.ok(text.includes(`disabled title="${escapeHtml(t('studio.edit.shell.reason.compare'))}"`));
  assert.ok(text.includes('<img class="cmp-shot" src="data:image/png;base64,iVBORw=="'));
  assert.ok(text.includes('data-original-problems="7"'));
  assert.ok(text.includes(escapeHtml(t('studio.rework.problems', { count: 7 }))));
  assert.ok(text.includes('data-frame="current"'));
  assert.ok(!text.includes('data-frame="before"'));
  assert.ok(!text.includes('data-compare'));
});

test('the original of a rework without measurements or a picture says so', async () => {
  const { store, root } = tempDrafts();
  reworkDraft(root, store, false);
  const text = await pages(store)('draft', { params: { slug: 'landing' }, query: 'compare=0' });
  assert.ok(text.includes(escapeHtml(t('studio.rework.notMeasured'))));
  assert.ok(!text.includes('data-original-problems'));
  const other = tempDrafts();
  createDraft(other.store, {
    slug: 'landing',
    title: 'Landing',
    kit: TINY,
    now: NOW,
    kind: 'rework',
    rework: { source: 'image' },
  });
  build(other.store, 'landing');
  const empty = await pages(other.store)('draft', {
    params: { slug: 'landing' },
    query: 'compare=0',
  });
  assert.ok(empty.includes(escapeHtml(t('studio.rework.none'))));
});

test('the score of the checks shows beside the original when checks.json has one', async () => {
  const { store, root } = tempDrafts();
  reworkDraft(root, store, true);
  store.writeText(
    'landing',
    'v1/build/json/checks.json',
    serializeJson({
      schemaVersion: 1,
      slug: 'landing',
      version: 1,
      checks: {
        build: 'ran',
        types: 'ran',
        ds: 'ran',
        a11y: 'ran',
        ui: 'ran',
        ux: 'ran',
        runtime: 'ran',
      },
      rework: { fixed: 5, left: 2 },
      summary: { fix: 0, review: 0 },
      browser: 'chrome',
      notes: [],
      shots: [],
      findings: [],
    }),
  );
  const text = await pages(store)('draft', { params: { slug: 'landing' }, query: 'compare=0' });
  assert.ok(text.includes(escapeHtml(t('studio.rework.score', { fixed: 5, left: 2 }))));
});

test('version 0 is only for a rework: a screen draft ignores compare=0', async () => {
  const { store } = shopDraft();
  build(store, 'shop');
  const text = await pages(store)('draft', { params: { slug: 'shop' }, query: 'compare=0' });
  assert.ok(!text.includes('original'));
  assert.ok(!text.includes('data-compare'));
});

test('the original picture is the shot nearest to the width, or the first image', () => {
  const source = {
    schemaVersion: 1 as const,
    source: 'url' as const,
    url: null,
    files: [],
    capturedAt: '',
    widths: [390, 1280],
    measured: true,
  };
  const inventory = { items: [] };
  const url = originalView({ source, inventory, problems: null, protected: null }, 768);
  assert.deepEqual(url, { problems: null, image: 'before/shots/390.png' });
  const wide = originalView({ source, inventory, problems: null, protected: null }, 900);
  assert.deepEqual(wide, { problems: null, image: 'before/shots/1280.png' });
  const figma = originalView(
    {
      source: { ...source, source: 'figma', files: ['home.png'], widths: [] },
      inventory,
      problems: { counts: {}, findings: [] },
      protected: null,
    },
    390,
  );
  assert.deepEqual(figma, { problems: 0, image: 'before/images/home.png' });
  const none = originalView(
    { source: { ...source, widths: [] }, inventory, problems: null, protected: null },
    390,
  );
  assert.equal(none.image, null);
});

test('a file outside before/ is refused', () => {
  const { store, root } = tempDrafts();
  reworkDraft(root, store, true);
  writeFileSync(join(root, 'landing', 'before', 'source.txt'), 'x');
  mkdirSync(join(root, 'landing', 'before', 'images'), { recursive: true });
  writeFileSync(join(root, 'landing', 'before', 'images', 'home.png'), Buffer.from([1, 2]));
  assert.ok(
    readBeforeImage(store, 'landing', 'before/shots/390.png')?.startsWith('data:image/png;base64,'),
  );
  assert.ok(readBeforeImage(store, 'landing', 'before/images/home.png'));
  for (const rel of [
    'draft.json',
    'v1/build/html/index.html',
    'before/source.json',
    'before/source.txt',
    'before/../draft.json',
    'before/shots/../../draft.json',
    'before/shots/390.svg',
    'before/shots/x.png',
    'before/images/.hidden.png',
    '../landing/before/shots/390.png',
    'before/shots/1280.png',
    '',
  ]) {
    assert.equal(readBeforeImage(store, 'landing', rel), undefined, rel);
  }
});

test('the craft page shows three pick commands and none picked', async () => {
  const { store } = tempDrafts();
  craftDraft(store);
  const text = await pages(store)('draft', { params: { slug: 'mark' } });
  for (const sketch of ['A', 'B', 'C']) {
    assert.ok(text.includes(`<code>kitvas craft pick mark ${sketch}</code>`), sketch);
  }
  assert.equal(text.match(/<li class="k-item sketch-card" data-sketch="[ABC]">/g)?.length, 3);
  assert.ok(text.includes(escapeHtml(t('studio.craft.pickHint'))));
  assert.ok(!text.includes(`>${t('studio.craft.picked')}</span>`));
  // The pick has a tab of its own in the right panel.
  assert.ok(text.includes('data-tab="sketches"'));
  assert.match(
    text,
    /data-shell="sketches" data-pane="sketches"[^>]*><section class="sketch-pick k-scroll"/,
  );
});

test('a picked sketch is named and marked', async () => {
  const { store } = tempDrafts();
  craftDraft(store);
  const draft = loadDraft(store, 'mark');
  assert.ok(draft.craft);
  store.writeText(
    'mark',
    'draft.json',
    serializeJson({ ...draft, craft: { ...draft.craft, picked: 'B' } }),
  );
  const text = await pages(store)('draft', { params: { slug: 'mark' } });
  assert.ok(text.includes(escapeHtml(t('studio.craft.pickedLine', { sketch: 'B' }))));
  const chip = '<span class="k-chip" data-tone="accent">Picked</span>';
  assert.equal(text.split(chip).length, 2, 'one sketch is marked');
  assert.ok(
    text.includes(
      `<div class="k-item sketch-card" data-sketch="B" aria-current="true"><div class="sketch-head"><h3>Sketch B</h3>${chip}`,
    ),
  );
  assert.ok(text.includes('<code>kitvas craft add mark</code>'));
  assert.ok(text.includes('<code>kitvas craft export mark --to &lt;folder&gt;</code>'));
  assert.ok(!text.includes('kitvas craft pick mark'));
  assert.ok(!text.includes(escapeHtml(t('studio.craft.pickHint'))));
});

test('the gallery labels every draft with its kind', async () => {
  const { store, root } = tempDrafts();
  createDraft(store, { slug: 'shop', title: 'Shop', kit: TINY, now: NOW });
  reworkDraft(root, store, true);
  craftDraft(store);
  store.writeText('bad', 'draft.json', '{ "schemaVersion": 2 }');
  const text = await pages(store)('home');
  assert.ok(text.includes('<span data-kind="screen">Screen</span>'));
  assert.ok(text.includes('<span data-kind="rework">Rework</span>'));
  assert.ok(text.includes('<span data-kind="craft">Craft</span>'));
  assert.equal(
    text.match(/<span data-kind="[a-z]+">/g)?.length,
    3,
    'an unreadable draft has no kind',
  );
});

test('the page of an old screen draft has no rework or craft markup', async () => {
  const { store } = shopDraft();
  const view = pages(store);
  const text = await view('draft', { params: { slug: 'shop' } });
  const canvas = /<section class="stage-canvas"[^>]*>([\s\S]*?)<\/section>/.exec(text)?.[1];
  // The canvas says what is missing and holds the one command that makes it.
  assert.ok(canvas?.includes(`<p>${escapeHtml(t('studio.draft.notBuilt', { version: 1 }))}</p>`));
  assert.ok(canvas?.includes('<div class="k-cmd"><code>kitvas build shop</code>'));
  assert.ok(!text.includes('<details class="bar-menu" data-shell="compare">'));
  assert.ok(text.includes('<button type="button" class="k-btn" data-shell="compare" disabled'));
  assert.ok(!text.includes('sketch-pick'));
  assert.ok(!text.includes('data-tab="sketches"'));
  assert.ok(!text.includes('original'));
  build(store, 'shop');
  const built = await view('draft', { params: { slug: 'shop' } });
  assert.ok(built.includes('data-frame="current"'));
  assert.ok(!built.includes('sketch-pick'));
  assert.ok(!built.includes('data-shell="sketches"'));
});
