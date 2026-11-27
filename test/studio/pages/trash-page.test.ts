import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createDraft, type DraftStore, deleteDraft } from '../../../src/drafts/index.ts';
import { createFolderKitStore } from '../../../src/kit/adapters/folder-store.ts';
import { escapeHtml } from '../../../src/studio/pages/html.ts';
import { pageRoutes } from '../../../src/studio/pages/routes.ts';
import { SKIN_TRASH } from '../../../src/studio/pages/skin/pages/trash.ts';
import { utcText } from '../../../src/studio/pages/trash/trash-list.ts';
import { TRASH_TEXT_KEYS, trashTexts } from '../../../src/studio/pages/trash/trash-texts.ts';
import { NOW, shopDraft, TINY } from '../../helpers/draft/drafts.ts';
import { FIXTURE_KITS } from '../../helpers/kit/kits.ts';
import { t } from '../../helpers/translate.ts';

const AT = new Date('2026-11-24T10:15:30.123Z');

async function page(store: DraftStore, id: 'home' | 'draft', path = '', query = '') {
  const routes = pageRoutes({
    drafts: store,
    kits: createFolderKitStore(FIXTURE_KITS),
    t,
    skin: '/* skin */',
    frame: { port: 5001, key: 'k3y' },
    version: '1.0.0',
    projectKit: () => 'kitvas-ui',
  });
  const route = routes.find((candidate) => candidate.id === id);
  assert.ok(route);
  const slug = path === '' ? {} : { slug: path };
  const answer = await route.handle({
    params: slug,
    headers: {},
    query: new URLSearchParams(query),
    host: '127.0.0.1:5000',
    nonce: 'N0nce',
  });
  if (typeof answer === 'string') return { status: 200, body: answer };
  return { status: answer.status, body: String(answer.body) };
}

test('a card has a quiet control that names the draft', async () => {
  const { store } = shopDraft();
  createDraft(store, { slug: 'evil', title: '<b>x</b>', kit: TINY, now: NOW });
  const { body } = await page(store, 'home');
  const label = escapeHtml(t('studio.trash.cardDelete', { title: 'Shop' }));
  assert.ok(
    body.includes(`data-trash-delete data-slug="shop" data-title="Shop" aria-label="${label}"`),
  );
  // A title is data: it is escaped in the attribute.
  assert.ok(body.includes('data-title="&lt;b&gt;x&lt;/b&gt;"'));
  assert.ok(!body.includes('<b>x</b>'));
  assert.ok(!/ style="/.test(body), 'no style attribute');
});

test('the Deleted filter is there only while a draft is deleted, and lists it with its actions', async () => {
  const { store } = shopDraft();
  createDraft(store, { slug: 'cart', title: 'Cart', kit: TINY, now: NOW });
  const before = (await page(store, 'home')).body;
  assert.ok(!before.includes('show=deleted'));
  assert.ok(!before.includes('data-trash-list'));

  deleteDraft(store, 'cart', AT);
  const all = (await page(store, 'home')).body;
  assert.ok(
    all.includes(
      `<a href="/?show=deleted">${escapeHtml(t('studio.trash.filterDeleted', { count: 1 }))}</a>`,
    ),
  );
  assert.ok(!all.includes('data-trash-list'), 'the list shows under its own filter');
  const shown = (await page(store, 'home', '', 'show=deleted')).body;
  assert.ok(
    shown.includes(
      `aria-current="true">${escapeHtml(t('studio.trash.filterDeleted', { count: 1 }))}`,
    ),
  );
  assert.ok(shown.includes('data-trash-list'));
  assert.ok(shown.includes('data-trash-restore'));
  assert.ok(shown.includes('data-trash-forever'));
  assert.ok(
    shown.includes(
      `<time datetime="2026-11-24T10:15:30.123Z" data-trash-time>${utcText('2026-11-24T10:15:30.123Z')}</time>`,
    ),
  );
  assert.ok(!shown.includes('gallery-grid'));
  assert.ok(!shown.includes('href="/drafts/cart"'), 'a deleted draft has no link');
});

test('Deleted with nothing deleted shows the drafts, and a gallery of only deleted drafts keeps its filter', async () => {
  const { store } = shopDraft();
  const none = (await page(store, 'home', '', 'show=deleted')).body;
  assert.ok(none.includes('gallery-grid'));
  assert.ok(!none.includes('data-trash-list'));
  deleteDraft(store, 'shop', AT);
  const only = (await page(store, 'home')).body;
  assert.ok(only.includes('<ol class="start-steps">'));
  assert.ok(only.includes('show=deleted'));
});

test('the texts block is JSON that cannot end its script, with every key the script asks for', () => {
  const block = trashTexts({ t, nonce: 'N0nce' }).text;
  assert.match(block, /^<script type="application\/json" id="trash-texts" nonce="N0nce">/);
  const json = block.slice(block.indexOf('>') + 1, block.lastIndexOf('</script>'));
  assert.ok(!json.includes('<'));
  const texts = JSON.parse(json) as Record<string, string>;
  assert.deepEqual(Object.keys(texts), [...TRASH_TEXT_KEYS]);
  assert.match(texts['delete.title'] ?? '', /\{title\}/);
});

test('a draft in the trash gets a page that says so, with Restore and a way back', async () => {
  const { store } = shopDraft();
  deleteDraft(store, 'shop', AT);
  const gone = await page(store, 'draft', 'shop');
  assert.equal(gone.status, 410);
  assert.ok(gone.body.includes('data-trash-gone data-slug="shop" data-title="Shop"'));
  assert.ok(gone.body.includes('data-trash-restore'));
  assert.ok(gone.body.includes('<a class="k-btn" href="/">'));
  assert.ok(gone.body.includes('id="trash-texts"'));
  assert.ok(gone.body.includes('/assets/gallery.js'));
});

test('a draft page has Delete draft in its More menu, and the confirm texts', async () => {
  const { store } = shopDraft();
  const open = (await page(store, 'draft', 'shop')).body;
  assert.ok(
    open.includes(
      `data-trash-delete data-slug="shop" data-title="Shop">${escapeHtml(t('studio.trash.menuDelete'))}</button>`,
    ),
  );
  assert.ok(open.includes('id="trash-texts"'));
});

test('the area rules write no style of their own kind: no colour, no kit token', () => {
  assert.ok(!SKIN_TRASH.includes('--kit-'));
  assert.doesNotMatch(SKIN_TRASH, /#[0-9a-f]{3,8}\b|rgba?\(/i);
});
