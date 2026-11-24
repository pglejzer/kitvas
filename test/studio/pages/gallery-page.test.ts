import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ChecksFile } from '../../../src/checks/index.ts';
import { createDraft, type DraftStore, serializeJson } from '../../../src/drafts/index.ts';
import { createFolderKitStore } from '../../../src/kit/adapters/folder-store.ts';
import { dotOf } from '../../../src/studio/pages/gallery.ts';
import { escapeHtml } from '../../../src/studio/pages/html.ts';
import { pageRoutes } from '../../../src/studio/pages/routes.ts';
import { NOW, shopDraft, TINY, tempDrafts } from '../../helpers/drafts.ts';
import { checksOf, finding } from '../../helpers/findings.ts';
import { FIXTURE_KITS } from '../../helpers/kits.ts';
import { t } from '../../helpers/translate.ts';

async function home(store: DraftStore, query = ''): Promise<string> {
  const routes = pageRoutes({
    drafts: store,
    kits: createFolderKitStore(FIXTURE_KITS),
    t,
    skin: '/* skin */',
    frame: { port: 5001, key: 'k3y' },
  });
  const route = routes.find((candidate) => candidate.id === 'home');
  assert.ok(route);
  const answer = await route.handle({
    params: {},
    headers: {},
    query: new URLSearchParams(query),
    host: '127.0.0.1:5000',
    nonce: 'N0nce',
  });
  assert.equal(typeof answer, 'string');
  return answer as string;
}

const build = (store: DraftStore, slug = 'shop'): void =>
  store.writeText(slug, 'v1/build/html/index.html', '<!doctype html>');

const check = (store: DraftStore, file: ChecksFile): void =>
  store.writeText(file.slug, `v${file.version}/build/json/checks.json`, serializeJson(file));

test('the dot beside a status says what its words say, and stays grey before there is a check', () => {
  assert.equal(dotOf({ kind: 'unreadable' }), 'fix');
  assert.equal(dotOf({ kind: 'notBuilt' }), null);
  assert.equal(dotOf({ kind: 'notChecked' }), null);
  assert.equal(dotOf({ kind: 'checked', fix: 2, review: 1 }), 'fix');
  assert.equal(dotOf({ kind: 'checked', fix: 0, review: 1 }), 'review');
  assert.equal(dotOf({ kind: 'checked', fix: 0, review: 0 }), 'good');
});

test('a card is a link, a live thumbnail, the version and a status with its dot', async () => {
  const { store } = shopDraft();
  createDraft(store, { slug: 'evil', title: '<script>alert(1)</script>', kit: TINY, now: NOW });
  let text = await home(store);
  assert.ok(text.includes('<main class="k-page">'));
  assert.ok(text.includes('<h1>Drafts</h1>'));
  assert.ok(text.includes('<h2><a class="gallery-name" href="/drafts/shop">Shop</a></h2>'));
  assert.ok(text.includes('<span>Version 1</span>'));
  assert.ok(text.includes('<span class="k-dot"></span><span class="k-quiet">Not built</span>'));
  assert.ok(text.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(!text.includes('<script>alert'));
  assert.ok(!text.includes('<iframe'));
  build(store);
  text = await home(store);
  assert.ok(
    text.includes(
      '<div class="gallery-thumb" inert><iframe src="http://127.0.0.1:5001/f/k3y/shop/v1/html/index.html?state=filled" sandbox="allow-scripts"',
    ),
  );
  assert.ok(text.includes('<span class="k-quiet">Not checked</span>'));
  check(store, checksOf([finding()]));
  assert.ok(
    (await home(store)).includes(
      '<span class="k-dot" data-state="fix"></span><span class="k-fix">1 to fix</span>',
    ),
  );
  assert.ok(!/ style="/.test(text), 'no style attribute');
});

test('the filter is a segmented control of links; the chosen one is current', async () => {
  const { store } = shopDraft();
  createDraft(store, { slug: 'calm', title: 'Calm', kit: TINY, now: NOW });
  build(store);
  build(store, 'calm');
  check(store, checksOf([finding()]));
  check(store, checksOf([finding({ severity: 'review' })], { slug: 'calm' }));
  const all = await home(store);
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
  const attention = await home(store, 'show=attention');
  assert.ok(
    attention.includes('<a href="/?show=attention" aria-current="true">Needs attention 1</a>'),
  );
  assert.ok(attention.includes('href="/drafts/shop"'));
  assert.ok(!attention.includes('href="/drafts/calm"'));
  check(store, checksOf([]));
  const calm = await home(store, 'show=attention');
  assert.ok(calm.includes(escapeHtml(t('studio.gallery.calm'))));
});

test('a draft that cannot be read has no link, and no drafts says how to make one', async () => {
  const { store } = shopDraft();
  store.writeText('bad', 'draft.json', '{ "schemaVersion": 2 }');
  const text = await home(store);
  assert.ok(text.includes('<h2>bad</h2>'));
  assert.ok(
    text.includes(
      '<span class="k-dot" data-state="fix"></span><span class="k-fix">Cannot be read</span>',
    ),
  );
  const empty = await home(tempDrafts().store);
  assert.ok(empty.includes('class="k-empty gallery-empty"'));
  assert.ok(empty.includes(escapeHtml(t('studio.gallery.emptyTitle'))));
  assert.ok(empty.includes('<div class="k-cmd"><code>/kitvas:compose</code><button'));
  assert.ok(empty.includes('data-copy'));
  // The View popover has segments too: the filter is known by its name.
  const filter = `aria-label="${escapeHtml(t('studio.gallery.filter'))}"`;
  assert.ok(text.includes(filter));
  assert.ok(!empty.includes(filter), 'no filter without drafts');
});
