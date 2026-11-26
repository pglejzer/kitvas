// A draft page that opens tells the studio which draft it shows (`PageDeps.opened`), so a build made
// by an older frame runtime is built again (the live loop's `opened`); a draft that is not there,
// or is in the trash, tells nothing.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { DraftStore } from '../../../src/drafts/index.ts';
import { createFolderKitStore } from '../../../src/kit/adapters/folder-store.ts';
import { pageRoutes } from '../../../src/studio/pages/routes.ts';
import { shopDraft } from '../../helpers/draft/drafts.ts';
import { FIXTURE_KITS } from '../../helpers/kit/kits.ts';
import { t } from '../../helpers/translate.ts';

function draftRoute(store: DraftStore, opened: string[]) {
  const routes = pageRoutes({
    drafts: store,
    kits: createFolderKitStore(FIXTURE_KITS),
    t,
    skin: '/* skin */',
    frame: { port: 5001, key: 'k3y' },
    version: '1.0.0',
    projectKit: () => 'base',
    opened: (slug) => {
      opened.push(slug);
    },
  });
  const route = routes.find((candidate) => candidate.id === 'draft');
  assert.ok(route);
  return (slug: string) =>
    route.handle({
      params: { slug },
      headers: {},
      query: new URLSearchParams(''),
      host: '127.0.0.1:5000',
      nonce: 'N0nce',
    });
}

test('the draft page that opens names its draft once a page is made', async () => {
  const { store } = shopDraft();
  store.writeText('shop', 'v1/build/html/index.html', '<!doctype html>');
  const opened: string[] = [];
  const open = draftRoute(store, opened);
  const page = await open('shop');
  assert.equal(typeof page, 'string');
  assert.deepEqual(opened, ['shop']);
});

test('a draft that is not there names nothing', async () => {
  const { store } = shopDraft();
  const opened: string[] = [];
  const open = draftRoute(store, opened);
  await assert.rejects(async () => open('gone'));
  assert.deepEqual(opened, []);
});
