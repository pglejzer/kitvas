import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ChecksFile } from '../../../src/checks/index.ts';
import {
  createDraft,
  type DraftStore,
  deleteDraft,
  serializeJson,
} from '../../../src/drafts/index.ts';
import { createFolderKitStore } from '../../../src/kit/adapters/folder-store.ts';
import { dotOf, galleryPage } from '../../../src/studio/pages/gallery.ts';
import { escapeHtml } from '../../../src/studio/pages/html.ts';
import { NOW, shopDraft, TINY, tempDrafts } from '../../helpers/drafts.ts';
import { checksOf, finding } from '../../helpers/findings.ts';
import { FIXTURE_KITS } from '../../helpers/kits.ts';
import { t } from '../../helpers/translate.ts';

type Options = { query?: string; kit?: string; now?: Date };

/** The home page of a store, with a clock, a version and a project kit of its own. */
function home(store: DraftStore, options: Options = {}): string {
  const { query = '', kit = 'tiny', now = NOW } = options;
  return galleryPage(
    {
      drafts: store,
      kits: createFolderKitStore(FIXTURE_KITS),
      t,
      skin: '/* skin */',
      frame: { port: 5001, key: 'k3y' },
      version: '1.0.0',
      projectKit: () => kit,
      now: () => now,
    },
    { query: new URLSearchParams(query), host: '127.0.0.1:5000', nonce: 'N0nce' },
  );
}

const build = (store: DraftStore, slug = 'shop'): void =>
  store.writeText(slug, 'v1/build/html/index.html', '<!doctype html>');

const check = (store: DraftStore, file: ChecksFile): void =>
  store.writeText(file.slug, `v${file.version}/build/json/checks.json`, serializeJson(file));

/** The page's main element, so the hidden paused view's own heading is not counted. */
const mainOf = (text: string): string => /<main[\s\S]*<\/main>/.exec(text)?.[0] ?? '';

/** Where `needle` stands in `text`; the test fails when it is not there. */
function at(text: string, needle: string): number {
  const index = text.indexOf(needle);
  assert.ok(index >= 0, `${needle} is on the page`);
  return index;
}

test('the dot beside a status says what its words say, and stays grey before there is a check', () => {
  assert.equal(dotOf({ kind: 'unreadable' }), 'fix');
  assert.equal(dotOf({ kind: 'notBuilt' }), null);
  assert.equal(dotOf({ kind: 'notChecked' }), null);
  assert.equal(dotOf({ kind: 'checked', fix: 2, review: 1 }), 'fix');
  assert.equal(dotOf({ kind: 'checked', fix: 0, review: 1 }), 'review');
  assert.equal(dotOf({ kind: 'checked', fix: 0, review: 0 }), 'good');
});

test('a card is a link, a live thumbnail, the version and a status with its dot', () => {
  const { store } = shopDraft();
  createDraft(store, { slug: 'evil', title: '<script>alert(1)</script>', kit: TINY, now: NOW });
  let text = home(store);
  assert.ok(text.includes('<main class="k-page start">'));
  assert.ok(text.includes('<h3><a class="gallery-name" href="/drafts/shop">Shop</a></h3>'));
  assert.ok(text.includes('<span>Version 1</span>'));
  assert.ok(text.includes('<span class="k-dot"></span><span class="k-quiet">Not built</span>'));
  assert.ok(text.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(!text.includes('<script>alert'));
  assert.ok(!text.includes('<iframe'));
  build(store);
  text = home(store);
  assert.ok(
    text.includes(
      '<div class="gallery-thumb" inert><iframe src="http://127.0.0.1:5001/f/k3y/shop/v1/html/index.html?state=filled" sandbox="allow-scripts"',
    ),
  );
  assert.ok(text.includes('<span class="k-quiet">Not checked</span>'));
  check(store, checksOf([finding()]));
  assert.ok(
    home(store).includes(
      '<span class="k-dot" data-state="fix"></span><span class="k-fix">1 to fix</span>',
    ),
  );
  assert.ok(!/ style="/.test(text), 'no style attribute');
});

test('the page has one h1, the logo block, and the drafts under an h2 with their count', () => {
  const { store } = shopDraft();
  const text = home(store);
  assert.equal(mainOf(text).match(/<h1/g)?.length, 1);
  assert.ok(text.includes('<section class="start-block k-inverse">'));
  assert.ok(
    text.includes(`<h2>${escapeHtml(t('studio.page.title'))}<span class="k-count">1</span></h2>`),
  );
});

test('the block is there in every view of the page', () => {
  const { store } = shopDraft();
  build(store);
  check(store, checksOf([finding()]));
  const gone = createDraft(store, { slug: 'gone', title: 'Gone', kit: TINY, now: NOW });
  deleteDraft(store, gone.slug, NOW);
  for (const query of ['', 'show=attention', 'show=deleted']) {
    assert.ok(home(store, { query }).includes('<section class="start-block k-inverse">'), query);
  }
});

test('the start switch has five commands, and four when there is no draft to edit', () => {
  const { store } = shopDraft();
  const text = home(store);
  for (const command of [
    '/kitvas:compose a pricing page with three plans',
    '/kitvas:rework https://your-app.example/billing',
    '/kitvas:craft a date range picker',
    '/kitvas:learn',
    '/kitvas:edit shop',
  ]) {
    assert.ok(text.includes(`<code>${command}</code>`), command);
  }
  assert.equal(text.match(/class="start-choice"/g)?.length, 5);
  assert.ok(text.includes('<div class="start-choice" data-panel="compose" data-on>'));
  assert.ok(text.includes('data-choice="edit"'));
  const empty = home(tempDrafts().store);
  assert.equal(empty.match(/class="start-choice"/g)?.length, 4);
  assert.ok(!empty.includes('/kitvas:edit'));
  assert.ok(!empty.includes('data-choice="edit"'));
  assert.ok(empty.includes('data-copy'), 'each command has a copy button');
});

test('the edit command names the draft changed last', () => {
  const { store } = tempDrafts();
  const older = new Date('2097-01-01T00:00:00Z');
  const newer = new Date('2098-01-01T00:00:00Z');
  createDraft(store, { slug: 'older', title: 'Older', kit: TINY, now: older });
  createDraft(store, { slug: 'newer', title: 'Newer', kit: TINY, now: newer });
  assert.ok(home(store).includes('<code>/kitvas:edit newer</code>'));
});

test('the facts line names the kit, counts the drafts and links those that need attention', () => {
  const { store } = shopDraft();
  build(store);
  check(store, checksOf([finding()]));
  const text = home(store);
  assert.ok(text.includes('href="/kit" title="Tiny">Kit Tiny</a>'));
  assert.ok(text.includes('<span>1 draft</span>'));
  assert.ok(text.includes('<a href="/?show=attention">1 needs attention</a>'));
  check(store, checksOf([]));
  const calm = home(store);
  assert.ok(calm.includes('<span>1 draft</span>'));
  assert.ok(!calm.includes('needs attention'), 'nothing to say at zero');
  assert.ok(!calm.includes('need attention'));
  createDraft(store, { slug: 'second', title: 'Second', kit: TINY, now: NOW });
  assert.ok(home(store).includes('<span>2 drafts</span>'));
});

test('a kit that does not load is named by its id, and no draft says so', () => {
  const text = home(tempDrafts().store, { kit: 'nope' });
  assert.ok(text.includes('>Kit nope</a>'));
  assert.ok(text.includes('<span>No drafts yet</span>'));
});

test('cards come newest change first, each with a time element that holds the exact time', () => {
  const { store } = tempDrafts();
  const dates = {
    'a-old': new Date('2097-06-15T12:00:00Z'),
    'b-mid': new Date('2098-06-15T12:00:00Z'),
    'c-new': new Date('2099-01-01T00:00:00Z'),
  };
  for (const [slug, now] of Object.entries(dates)) {
    createDraft(store, { slug, title: slug, kit: TINY, now });
  }
  const text = home(store, { now: new Date('2099-01-01T00:12:00Z') });
  assert.ok(at(text, 'href="/drafts/c-new"') < at(text, 'href="/drafts/b-mid"'));
  assert.ok(at(text, 'href="/drafts/b-mid"') < at(text, 'href="/drafts/a-old"'));
  assert.ok(
    text.includes(
      '<time datetime="2099-01-01T00:00:00.000Z" title="2099-01-01 00:00 UTC">12 minutes ago</time>',
    ),
  );
  assert.ok(text.includes('<time datetime="2098-06-15T12:00:00.000Z"'));
});

test('a draft that cannot be read has no link or time, still renders, and comes last', () => {
  const { store } = shopDraft();
  store.writeText('aaa-bad', 'draft.json', '{ "schemaVersion": 2 }');
  const text = home(store);
  assert.ok(text.includes('<h3>aaa-bad</h3>'));
  assert.ok(
    text.includes(
      '<span class="k-dot" data-state="fix"></span><span class="k-fix">Cannot be read</span>',
    ),
  );
  assert.ok(at(text, 'href="/drafts/shop"') < at(text, '<h3>aaa-bad</h3>'));
  const bad = text.slice(at(text, '<h3>aaa-bad</h3>'));
  assert.ok(!bad.slice(0, bad.indexOf('</li>')).includes('<time'));
});

test('a draft whose time cannot be read still renders, and comes last', () => {
  const { store } = tempDrafts();
  createDraft(store, {
    slug: 'fine',
    title: 'Fine',
    kit: TINY,
    now: new Date('2098-01-01T00:00:00Z'),
  });
  createDraft(store, {
    slug: 'zzz',
    title: 'Zzz',
    kit: TINY,
    now: new Date('2099-01-01T00:00:00Z'),
  });
  const refusing: DraftStore = {
    ...store,
    modifiedAt: (slug, relPath) => {
      if (slug === 'zzz') throw new Error('the disk said no');
      return store.modifiedAt(slug, relPath);
    },
  };
  const text = home(refusing);
  assert.ok(text.includes('href="/drafts/zzz"'), 'the draft is still a card');
  assert.ok(at(text, 'href="/drafts/fine"') < at(text, 'href="/drafts/zzz"'));
});

test('the list folds in the All view only, and its button holds the count', () => {
  const { store } = shopDraft();
  build(store);
  check(store, checksOf([finding()]));
  createDraft(store, { slug: 'calm', title: 'Calm', kit: TINY, now: NOW });
  const all = home(store);
  assert.ok(all.includes('<ul class="gallery-grid" data-fold role="list">'));
  assert.ok(all.includes('data-text-all="Show all 2 drafts"'));
  assert.ok(all.includes('data-text-fewer="Show fewer"'));
  assert.ok(
    all.includes(
      '<p class="start-more" hidden><button type="button" class="k-btn" data-fold-toggle',
    ),
  );
  assert.ok(all.includes('aria-expanded="false"'));
  const attention = home(store, { query: 'show=attention' });
  assert.ok(attention.includes('<ul class="gallery-grid" role="list">'));
  assert.ok(!attention.includes('<ul class="gallery-grid" data-fold'));
  assert.ok(!attention.includes('data-fold-toggle'));
});

test('the fold is set before the first paint in every view, on the response nonce', () => {
  const { store } = shopDraft();
  const pages = [home(store), home(tempDrafts().store), home(store, { query: 'show=attention' })];
  for (const text of pages) {
    const script = '<script nonce="N0nce">(function(){var v=';
    assert.ok(text.indexOf(script) > 0);
    assert.ok(text.indexOf(script) < at(text, 'class="start-block'), 'before the block');
  }
});

test('with no draft the first steps stand in place of the list', () => {
  const text = home(tempDrafts().store);
  const steps = /<ol class="start-steps">([\s\S]*?)<\/ol>/.exec(text)?.[1] ?? '';
  assert.equal(steps.match(/<li>/g)?.length, 3);
  for (const title of ['Ask for a screen', 'See what is off', 'Change it here']) {
    assert.ok(steps.includes(`<h3>${title}</h3>`), title);
  }
  assert.ok(text.includes('<h2>How it goes</h2>'));
  assert.ok(!text.includes('class="gallery-grid"'));
  assert.ok(!text.includes('data-fold-toggle'));
  assert.ok(!text.includes('k-empty'));
  // The filter has nothing to filter, so it is not drawn.
  assert.ok(!text.includes(`aria-label="${escapeHtml(t('studio.gallery.filter'))}"`));
});

test('first run keeps the filter when some draft is in the trash', () => {
  const { store } = shopDraft();
  deleteDraft(store, 'shop', NOW);
  const text = home(store);
  assert.ok(text.includes('<h2>How it goes</h2>'));
  assert.ok(text.includes(`aria-label="${escapeHtml(t('studio.gallery.filter'))}"`));
  assert.ok(text.includes('href="/?show=deleted"'));
});

test('the foot line holds the version, the address and the three small pages', () => {
  const text = home(shopDraft().store);
  const foot = /<footer class="start-foot">([\s\S]*?)<\/footer>/.exec(text)?.[1] ?? '';
  assert.ok(foot.includes('<span>kitvas 1.0.0</span>'));
  assert.ok(foot.includes('<span>Studio at 127.0.0.1:5000</span>'));
  assert.ok(foot.includes('<a href="/guide">Guide</a>'));
  assert.ok(foot.includes('<a href="/shortcuts">Shortcuts</a>'));
  assert.ok(foot.includes('<a href="/doctor">Doctor report</a>'));
});

test('the filter is a segmented control of links; the chosen one is current', () => {
  const { store } = shopDraft();
  createDraft(store, { slug: 'calm', title: 'Calm', kit: TINY, now: NOW });
  build(store);
  build(store, 'calm');
  check(store, checksOf([finding()]));
  check(store, checksOf([finding({ severity: 'review' })], { slug: 'calm' }));
  const all = home(store);
  assert.ok(
    all.includes(
      `<nav class="k-seg" aria-label="${escapeHtml(t('studio.gallery.filter'))}"><a href="/" aria-current="true">All 2</a><a href="/?show=attention">Needs attention 1</a></nav>`,
    ),
  );
  assert.ok(
    all.includes(
      '<span class="k-dot" data-state="review"></span><span class="k-review">1 to review</span>',
    ),
  );
  const attention = home(store, { query: 'show=attention' });
  assert.ok(
    attention.includes('<a href="/?show=attention" aria-current="true">Needs attention 1</a>'),
  );
  assert.ok(attention.includes('href="/drafts/shop"'));
  assert.ok(!attention.includes('href="/drafts/calm"'));
  check(store, checksOf([]));
  const calm = home(store, { query: 'show=attention' });
  assert.ok(calm.includes(escapeHtml(t('studio.gallery.calm'))));
});

test('a draft that cannot be read has no link, and a page with no drafts has no filter', () => {
  const { store } = shopDraft();
  store.writeText('bad', 'draft.json', '{ "schemaVersion": 2 }');
  const text = home(store);
  assert.ok(text.includes('<h3>bad</h3>'));
  // The View popover has segments too: the filter is known by its name.
  const filter = `aria-label="${escapeHtml(t('studio.gallery.filter'))}"`;
  assert.ok(text.includes(filter));
  assert.ok(!home(tempDrafts().store).includes(filter), 'no filter without drafts');
});

const GHOST = { id: 'ghost', version: '2.1.0', hash: 'b'.repeat(64) };

/** The group sections of a page, in order, each as its markup. */
const groupsOf = (text: string): string[] =>
  [...mainOf(text).matchAll(/<section class="gallery-group"[\s\S]*?<\/section>/g)].map(
    (found) => found[0],
  );

test('the drafts stand in a group a kit, with its name, version and count, even for one kit', () => {
  const { store } = shopDraft();
  createDraft(store, { slug: 'second', title: 'Second', kit: TINY, now: NOW });
  const groups = groupsOf(home(store));
  assert.equal(groups.length, 1);
  const only = groups[0] ?? '';
  assert.ok(only.includes('<h3 id="gallery-group-0">Tiny</h3>'));
  assert.ok(only.includes('<span class="gallery-group-version k-meta">v1.0.0</span>'));
  assert.ok(only.includes('<span class="k-count" data-group-count>2</span>'));
  assert.ok(only.includes('href="/drafts/shop"') && only.includes('href="/drafts/second"'));
  assert.ok(!only.includes('Not in this project'));
});

test('the project kit has the first group, and a kit that is gone is named by its id with a note', () => {
  const { store } = tempDrafts();
  const older = new Date('2097-01-01T00:00:00Z');
  const newer = new Date('2098-01-01T00:00:00Z');
  createDraft(store, { slug: 'old-tiny', title: 'Old tiny', kit: TINY, now: older });
  createDraft(store, { slug: 'newer-ghost', title: 'Newer ghost', kit: GHOST, now: newer });
  const groups = groupsOf(home(store, { now: newer }));
  assert.equal(groups.length, 2);
  assert.ok((groups[0] ?? '').includes('>Tiny</h3>'), 'the project kit first, though older');
  const ghost = groups[1] ?? '';
  assert.ok(ghost.includes('>ghost</h3>'));
  assert.ok(ghost.includes('v2.1.0'));
  assert.ok(ghost.includes('<span class="gallery-group-note k-meta">Not in this project</span>'));
  assert.ok(ghost.includes('href="/drafts/newer-ghost"'));
});

test('a draft that cannot be read stands in the last group', () => {
  const { store } = shopDraft();
  store.writeText('aaa-bad', 'draft.json', '{ "schemaVersion": 2 }');
  const groups = groupsOf(home(store));
  assert.equal(groups.length, 2);
  assert.ok((groups[1] ?? '').includes('Kit unknown'));
  assert.ok((groups[1] ?? '').includes('<h3>aaa-bad</h3>'));
});

test('the filter leaves out a group with no card under it, and the totals stay', () => {
  const { store } = shopDraft();
  createDraft(store, { slug: 'calm-ghost', title: 'Calm ghost', kit: GHOST, now: NOW });
  build(store);
  build(store, 'calm-ghost');
  check(store, checksOf([finding()]));
  check(store, checksOf([], { slug: 'calm-ghost' }));
  const all = home(store);
  assert.equal(groupsOf(all).length, 2);
  const attention = home(store, { query: 'show=attention' });
  const groups = groupsOf(attention);
  assert.equal(groups.length, 1);
  assert.ok((groups[0] ?? '').includes('href="/drafts/shop"'));
  assert.ok(attention.includes('>All 2</a>'));
  assert.ok(attention.includes('>Needs attention 1</a>'));
  assert.ok(!(groups[0] ?? '').includes('data-fold'), 'only the All view folds');
});

test('each group folds on its own in the All view', () => {
  const { store } = shopDraft();
  createDraft(store, { slug: 'ghost-one', title: 'Ghost one', kit: GHOST, now: NOW });
  const text = home(store);
  assert.equal(text.match(/<ul class="gallery-grid" data-fold role="list">/g)?.length, 2);
  assert.equal(text.match(/data-fold-toggle/g)?.length, 2);
  assert.ok(text.includes('data-text-all="Show all 1 drafts"'));
});

test('the search field has its label, and a card carries the words the search reads', () => {
  const text = home(shopDraft().store);
  assert.ok(text.includes('<label class="k-search gallery-search"><svg class="k-icon"'));
  assert.ok(text.includes('<input class="k-field" type="search" data-gallery-search'));
  assert.ok(text.includes('aria-label="Search drafts"'));
  assert.ok(text.indexOf('data-gallery-search') < text.indexOf('<nav class="k-seg"'));
  const words = 'Shop shop Tiny tiny screen Screen';
  assert.ok(text.includes(`<li class="gallery-card" data-search="${words}">`));
  const none = '<p class="k-quiet" data-search-empty hidden>No draft matches your search.</p>';
  assert.ok(text.includes(none));
});

test('there is no search with no draft or on the Deleted list', () => {
  assert.ok(!home(tempDrafts().store).includes('data-gallery-search'));
  const { store } = shopDraft();
  createDraft(store, { slug: 'gone', title: 'Gone', kit: TINY, now: NOW });
  deleteDraft(store, 'gone', NOW);
  assert.ok(home(store).includes('data-gallery-search'));
  const deleted = home(store, { query: 'show=deleted' });
  assert.ok(!deleted.includes('data-gallery-search'));
  assert.ok(!deleted.includes('data-group'));
});
