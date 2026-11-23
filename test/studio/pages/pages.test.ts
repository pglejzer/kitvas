import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ChecksFile } from '../../../src/checks/index.ts';
import {
  addVersion,
  createDraft,
  type DraftStore,
  serializeJson,
} from '../../../src/drafts/index.ts';
import { createFolderKitStore } from '../../../src/kit/adapters/folder-store.ts';
import { KitvasError } from '../../../src/shared/index.ts';
import { escapeHtml, html } from '../../../src/studio/pages/html.ts';
import { pageRoutes } from '../../../src/studio/pages/routes.ts';
import { NOW, shopDraft, TINY, tempDrafts } from '../../helpers/drafts.ts';
import { checksOf, finding } from '../../helpers/findings.ts';
import { FIXTURE_KITS } from '../../helpers/kits.ts';
import { t } from '../../helpers/translate.ts';

type Ask = { params?: Record<string, string>; query?: string; host?: string };

function pages(store: DraftStore) {
  const routes = pageRoutes({
    drafts: store,
    kits: createFolderKitStore(FIXTURE_KITS),
    t,
    skin: '/* skin */',
    frame: { port: 5001, key: 'k3y' },
  });
  return async (id: string, ask: Ask = {}): Promise<string> => {
    const route = routes.find((candidate) => candidate.id === id);
    assert.ok(route, id);
    const answer = await route.handle({
      params: ask.params ?? {},
      headers: {},
      query: new URLSearchParams(ask.query ?? ''),
      host: ask.host ?? '127.0.0.1:5000',
      nonce: 'N0nce',
    });
    assert.equal(typeof answer, 'string', 'these pages answer with HTML');
    return answer as string;
  };
}

const build = (store: DraftStore, slug = 'shop', version = 1): void =>
  store.writeText(slug, `v${version}/build/html/index.html`, '<!doctype html>');

const check = (store: DraftStore, file: ChecksFile): void =>
  store.writeText(file.slug, `v${file.version}/build/json/checks.json`, serializeJson(file));

const SHOP = { params: { slug: 'shop' } };

/** The end of a frame address in a page's HTML: a 22-character channel and the studio port. */
const HASH_5000 = '#kitvas=[A-Za-z0-9_-]{22}&amp;studio=5000';

test('values are escaped, HTML from html is kept, lists are joined', () => {
  const name = `<b>"Tom" & 'Jerry'</b>`;
  assert.equal(
    html`<p>${name}</p>`.text,
    '<p>&lt;b&gt;&quot;Tom&quot; &amp; &#39;Jerry&#39;&lt;/b&gt;</p>',
  );
  const items = ['a', 'b'].map((item) => html`<li>${item}</li>`);
  assert.equal(html`<ul>${items}</ul>`.text, '<ul><li>a</li><li>b</li></ul>');
  assert.equal(html`${null}${undefined}${false}${0}`.text, '0');
  assert.equal(escapeHtml('a<b'), 'a&lt;b');
});

test('the gallery shows each draft with a live thumbnail, its version and status', async () => {
  const { store } = shopDraft();
  createDraft(store, { slug: 'evil', title: '<script>alert(1)</script>', kit: TINY, now: NOW });
  const view = pages(store);
  let text = await view('home');
  assert.ok(text.includes('<style nonce="N0nce">/* skin */</style>'));
  assert.ok(text.includes('<h1>Drafts</h1>'));
  assert.ok(
    text.includes(
      '<h2><a href="/drafts/shop">Shop</a></h2><p class="meta"><span>Version 1</span><span class="quiet">Not built</span></p>',
    ),
  );
  assert.ok(text.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(!text.includes('<script>'));
  assert.ok(!text.includes('<iframe'));
  build(store);
  text = await view('home');
  assert.ok(
    text.includes(
      '<div class="thumb" inert><iframe src="http://127.0.0.1:5001/f/k3y/shop/v1/html/index.html?state=filled" sandbox="allow-scripts"',
    ),
  );
  assert.ok(text.includes('<span class="quiet">Not checked</span>'));
  check(store, checksOf([finding()]));
  assert.ok((await view('home')).includes('<span class="fix">1 to fix</span>'));
});

test('the filter shows all drafts or only those that need attention', async () => {
  const { store } = shopDraft();
  createDraft(store, { slug: 'calm', title: 'Calm', kit: TINY, now: NOW });
  build(store);
  build(store, 'calm');
  check(store, checksOf([finding()]));
  check(store, checksOf([finding({ severity: 'review' })], { slug: 'calm' }));
  const view = pages(store);
  const all = await view('home');
  assert.ok(all.includes('<a class="opt" href="/" aria-current="true">All 2</a>'));
  assert.ok(all.includes('<a class="opt" href="/?show=attention">Needs attention 1</a>'));
  assert.ok(all.includes('<span class="review">1 to review</span>'));
  const attention = await view('home', { query: 'show=attention' });
  assert.ok(
    attention.includes(
      '<a class="opt" href="/?show=attention" aria-current="true">Needs attention 1</a>',
    ),
  );
  assert.ok(attention.includes('href="/drafts/shop"'));
  assert.ok(!attention.includes('href="/drafts/calm"'));
  check(store, checksOf([]));
  const calm = await view('home', { query: 'show=attention' });
  assert.ok(calm.includes(escapeHtml(t('studio.gallery.calm'))));
});

test('a draft that cannot be read is listed without a link; no drafts says how to make one', async () => {
  const { store } = shopDraft();
  store.writeText('bad', 'draft.json', '{ "schemaVersion": 2 }');
  const text = await pages(store)('home');
  assert.ok(
    text.includes('<h2>bad</h2><p class="meta"><span class="fix">Cannot be read</span></p>'),
  );
  const empty = await pages(tempDrafts().store)('home');
  assert.ok(empty.includes(escapeHtml(t('studio.page.empty'))));
  assert.ok(!empty.includes('class="row"'));
});

test('a draft not built yet says how to build it', async () => {
  const { store } = shopDraft();
  const text = await pages(store)('draft', SHOP);
  assert.ok(text.includes('<h1>Shop</h1>'));
  assert.ok(text.includes(escapeHtml(t('studio.page.notBuilt', { version: 1, slug: 'shop' }))));
  assert.ok(text.includes(escapeHtml(t('studio.next.build', { slug: 'shop' }))));
  assert.ok(!text.includes('<iframe'));
  assert.ok(!text.includes('Built from'));
});

test('a built draft is framed at the phone width in its default state', async () => {
  const { store } = shopDraft();
  build(store);
  const text = await pages(store)('draft', { ...SHOP, host: 'localhost:5000' });
  assert.match(
    text,
    new RegExp(
      `<iframe src="http://localhost:5001/f/k3y/shop/v1/html/index\\.html\\?state=filled${HASH_5000}" width="390" sandbox="allow-scripts"`,
    ),
  );
  assert.ok(!text.includes('allow-same-origin'));
  assert.match(text, /^<!doctype html>[\s\S]*<main class="draft-page" data-draft="shop"/m);
  assert.ok(
    text.includes(
      '<main class="draft-page" data-draft="shop" data-version="1" data-state="filled" data-width="390">',
    ),
  );
  // The latest built version can be edited: the toggle opens the controls, the panel follows the
  // stage, and the notes close the layout.
  assert.ok(
    text.includes('</section></div><script type="module" src="/assets/draft.js"></script></main>'),
  );
  assert.ok(
    text.includes(
      '<section class="controls" aria-label="View"><button type="button" class="edit-toggle"',
    ),
  );
  assert.ok(text.includes('</section><aside class="edit-panel" data-edit-panel hidden'));
  assert.ok(!text.includes('data-compare'));
  assert.ok(!text.includes('data-frame="before"'));
  assert.ok(text.includes('<div class="draft">'));
  assert.ok(text.includes('<p class="caption">390 px wide</p>'));
  assert.ok(
    text.includes(
      '<a class="opt" href="/drafts/shop?version=1&amp;state=filled&amp;width=390" aria-current="true">Phone</a>',
    ),
  );
  assert.ok(
    text.includes(
      '<a class="opt" href="/drafts/shop?version=1&amp;state=filled&amp;width=768">Tablet</a>',
    ),
  );
  assert.ok(text.includes('<p>Built from the Tiny kit.</p><p>Not checked yet.</p>'));
  assert.ok(text.includes(escapeHtml(t('studio.next.check', { slug: 'shop' }))));
});

test('the address picks the version, state and width; anything else falls back', async () => {
  const { store } = shopDraft();
  const states = {
    schemaVersion: 1,
    default: 'filled',
    states: [
      { id: 'filled', label: 'With data' },
      { id: 'empty', label: 'Empty' },
    ],
  };
  store.writeText('shop', 'v1/src/json/states.json', serializeJson(states));
  addVersion(store, 'shop', NOW);
  build(store);
  build(store, 'shop', 2);
  const view = pages(store);
  const picked = await view('draft', { ...SHOP, query: 'version=1&state=empty&width=1280' });
  assert.match(
    picked,
    new RegExp(
      `src="http://127.0.0.1:5001/f/k3y/shop/v1/html/index\\.html\\?state=empty${HASH_5000}" width="1280"`,
    ),
  );
  assert.ok(picked.includes('<div class="draft wide">'));
  assert.ok(
    picked.includes(
      '<a class="opt" data-state="empty" href="/drafts/shop?version=1&amp;state=empty&amp;width=1280" aria-current="true">Empty</a>',
    ),
  );
  assert.ok(
    picked.includes(
      '<a class="opt" data-state="filled" href="/drafts/shop?version=1&amp;state=filled&amp;width=1280">With data</a>',
    ),
  );
  assert.ok(
    picked.includes(
      '<a class="opt" href="/drafts/shop?version=2&amp;state=empty&amp;width=1280">2</a>',
    ),
  );
  const fallback = await view('draft', { ...SHOP, query: 'version=9&state=gone&width=1024' });
  assert.match(
    fallback,
    new RegExp(
      `src="http://127.0.0.1:5001/f/k3y/shop/v2/html/index\\.html\\?state=filled${HASH_5000}" width="390"`,
    ),
  );
});

const STATES_FILE = {
  schemaVersion: 1,
  default: 'filled',
  states: [
    { id: 'filled', label: 'With data' },
    { id: 'empty', label: 'Empty' },
  ],
};

function twoVersions(): DraftStore {
  const { store } = shopDraft();
  store.writeText('shop', 'v1/src/json/states.json', serializeJson(STATES_FILE));
  addVersion(store, 'shop', NOW);
  store.writeText('shop', 'v2/src/json/states.json', serializeJson(STATES_FILE));
  build(store);
  build(store, 'shop', 2);
  return store;
}

test('the frame address ends with a fresh channel and the studio port', async () => {
  const { store } = shopDraft();
  build(store);
  const view = pages(store);
  const first = await view('draft', SHOP);
  const second = await view('draft', SHOP);
  const channelOf = (text: string): string | undefined =>
    /data-channel="([A-Za-z0-9_-]{22})"/.exec(text)?.[1];
  assert.ok(channelOf(first));
  assert.notEqual(channelOf(first), channelOf(second));
  assert.ok(first.includes(`#kitvas=${channelOf(first)}&amp;studio=5000"`));
  assert.ok(first.includes(`data-frame="current" data-channel="${channelOf(first)}"`));
});

test('compare shows the other version first, captioned, with the same state and width', async () => {
  const view = pages(twoVersions());
  const text = await view('draft', { ...SHOP, query: 'version=2&state=empty&width=768&compare=1' });
  assert.ok(
    text.includes('data-version="2" data-state="empty" data-width="768" data-compare="1">'),
  );
  const before = text.indexOf('data-frame="before"');
  const current = text.indexOf('data-frame="current"');
  assert.ok(before !== -1 && before < current);
  assert.match(text, new RegExp(`/shop/v1/html/index\\.html\\?state=empty${HASH_5000}"`));
  assert.match(text, new RegExp(`/shop/v2/html/index\\.html\\?state=empty${HASH_5000}"`));
  const channels = [...text.matchAll(/data-channel="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(channels.length, 2);
  assert.notEqual(channels[0], channels[1]);
  assert.ok(text.indexOf('Version 1</p>') < text.indexOf('Version 2</p>'));
  assert.ok(text.includes('<div class="draft wide">'));
  assert.ok(
    text.includes(
      '<p class="compare-summary" role="status" aria-live="polite" data-changed="{count} changed" data-added="{count} added" data-removed="{count} removed" data-same="Nothing changed"></p>',
    ),
  );
  assert.ok(
    text.includes(
      '<nav class="row" aria-label="Compare"><a class="opt" href="/drafts/shop?version=2&amp;state=empty&amp;width=768">Stop comparing</a></nav>',
    ),
  );
  // The links keep the comparison, except a version link to the compared version.
  assert.ok(
    text.includes('href="/drafts/shop?version=2&amp;state=filled&amp;width=768&amp;compare=1"'),
  );
  assert.ok(text.includes('href="/drafts/shop?version=1&amp;state=empty&amp;width=768">1</a>'));
});

test('without compare an earlier version is offered; the oldest has none to offer', async () => {
  const view = pages(twoVersions());
  const latest = await view('draft', SHOP);
  assert.ok(
    latest.includes(
      '<nav class="row" aria-label="Compare"><a class="opt" href="/drafts/shop?version=2&amp;state=filled&amp;width=390&amp;compare=1">Compare with version 1</a></nav>',
    ),
  );
  const oldest = await view('draft', { ...SHOP, query: 'version=1' });
  assert.ok(!oldest.includes('aria-label="Compare"'));
  // Comparing a version with itself, or with one the draft lacks, is no comparison.
  for (const compare of ['2', '9', 'x']) {
    const text = await view('draft', { ...SHOP, query: `compare=${compare}` });
    assert.ok(!text.includes('data-compare'), compare);
    assert.ok(!text.includes('data-frame="before"'), compare);
  }
});

test('a compared version that is not built says so and has no summary to fill', async () => {
  const { store } = shopDraft();
  addVersion(store, 'shop', NOW);
  build(store, 'shop', 2);
  const text = await pages(store)('draft', { ...SHOP, query: 'compare=1' });
  assert.ok(text.includes(escapeHtml(t('studio.page.notBuilt', { version: 1, slug: 'shop' }))));
  assert.ok(!text.includes('data-frame="before"'));
  assert.ok(text.includes('data-frame="current"'));
  assert.ok(!text.includes('compare-summary'));
});

test('a note carries its tone and, when it has one, its element', async () => {
  const { store } = shopDraft();
  build(store);
  check(
    store,
    checksOf([
      finding({ element: 'Draft:main/Input.0' }),
      finding({ severity: 'review', check: 'ds', rule: 'ds/raw-color', element: null }),
    ]),
  );
  const text = await pages(store)('draft', SHOP);
  assert.ok(text.includes('<li class="note" data-tone="fix" data-element="Draft:main/Input.0">'));
  assert.ok(text.includes('<li class="note" data-tone="review"><span class="num">2</span>'));
});

test('the gallery ends its main with the gallery script', async () => {
  const { store } = shopDraft();
  const text = await pages(store)('home');
  assert.ok(text.includes('<script type="module" src="/assets/gallery.js"></script></main>'));
  const empty = await pages(tempDrafts().store)('home');
  assert.ok(empty.includes('<script type="module" src="/assets/gallery.js"></script></main>'));
});

test('findings of this state and width are numbered beside the frame, with the next step', async () => {
  const { store } = shopDraft();
  build(store);
  const wide = finding({
    severity: 'review',
    check: 'ds',
    rule: 'ds/raw-color',
    message: 'The total colour is typed by hand.',
    states: ['filled'],
    widths: [1280],
  });
  check(store, checksOf([finding(), wide]));
  const view = pages(store);
  const phone = await view('draft', SHOP);
  assert.ok(phone.includes('<h2 class="fix">1 to fix</h2>'));
  assert.ok(
    phone.includes(
      '<span class="num">1</span><div>The phone field has no label.<small>Accessibility</small>',
    ),
  );
  assert.ok(!phone.includes('The total colour'));
  assert.ok(phone.includes('1 more in other widths or states.'));
  assert.ok(phone.includes(escapeHtml(t('studio.next.fix', { slug: 'shop' }))));
  const desktop = await view('draft', { ...SHOP, query: 'width=1280' });
  assert.ok(
    desktop.includes(
      '<span class="num">2</span><div>The total colour is typed by hand.<small>Kit rules</small>',
    ),
  );
});

test('clean checks say so and suggest the next version; skipped checks are named', async () => {
  const { store } = shopDraft();
  build(store);
  const checks = {
    build: 'ran',
    types: 'ran',
    ds: 'ran',
    a11y: 'skipped',
    ui: 'skipped',
    ux: 'skipped',
    runtime: 'skipped',
  } as const;
  check(store, checksOf([], { checks }));
  const text = await pages(store)('draft', SHOP);
  assert.ok(
    text.includes(
      '<p>Not run: Accessibility, Look, Usability, Runtime.</p><p>Nothing to fix or review.</p>',
    ),
  );
  assert.ok(text.includes(escapeHtml(t('studio.next.good', { next: 2 }))));
  assert.ok(!text.includes('<h2'));
});

test('a kit that is gone is named by its id; a missing draft is an error', async () => {
  const { store } = tempDrafts();
  createDraft(store, { slug: 'shop', title: 'Shop', kit: { ...TINY, id: 'gone' }, now: NOW });
  build(store);
  const view = pages(store);
  assert.ok((await view('draft', SHOP)).includes('<p>Built from the gone kit.</p>'));
  await assert.rejects(
    view('draft', { params: { slug: 'nope' } }),
    (error: unknown) => error instanceof KitvasError && error.code === 'DRAFT_NOT_FOUND',
  );
});

test('an older checks.json without ui and ux reads: its findings show, the new checks are not run', async () => {
  const { store } = shopDraft();
  build(store);
  const old = {
    schemaVersion: 1,
    slug: 'shop',
    version: 1,
    checks: { build: 'ran', types: 'ran', ds: 'ran', a11y: 'ran', runtime: 'ran' },
    summary: { fix: 1, review: 0 },
    browser: 'chrome',
    notes: [],
    shots: [],
    findings: [finding({ states: ['filled'], widths: [390, 1280] })],
  };
  store.writeText('shop', 'v1/build/json/checks.json', serializeJson(old));
  const text = await pages(store)('draft', SHOP);
  assert.ok(text.includes('<h2 class="fix">1 to fix</h2>'));
  assert.ok(
    text.includes(
      '<span class="num">1</span><div>The phone field has no label.<small>Accessibility</small>',
    ),
  );
  assert.ok(text.includes('<p>Not run: Look, Usability.</p>'));
});

test('findings seen at widths the studio lacks show at the nearest one', async () => {
  const { store } = shopDraft();
  build(store);
  const narrow = finding({ states: ['filled'], widths: [320], message: 'Wider than 320.' });
  const wide = finding({ states: ['filled'], widths: [1024, 1440], line: 30, message: 'At 1440.' });
  check(store, checksOf([narrow, wide]));
  const view = pages(store);
  const phone = await view('draft', SHOP);
  assert.ok(phone.includes('<span class="num">1</span><div>Wider than 320.'));
  assert.ok(!phone.includes('At 1440.'));
  const desktop = await view('draft', { ...SHOP, query: 'width=1280' });
  assert.ok(desktop.includes('<span class="num">1</span><div>At 1440.'));
  assert.ok(!desktop.includes('Wider than 320.'));
});
