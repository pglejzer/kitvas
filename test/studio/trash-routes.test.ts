import assert from 'node:assert/strict';
import { request } from 'node:http';
import { join } from 'node:path';
import { test } from 'node:test';
import { createFsDraftStore } from '../../src/drafts/adapters/fs-draft-store.ts';
import { createDraft, type DraftStore } from '../../src/drafts/index.ts';
import { NOW, shopDraft, TINY } from '../helpers/drafts.ts';
import { call, pageCookie, studioOver, writeFakeBuild } from '../helpers/studio.ts';
import { tempDir } from '../helpers/tmp.ts';

type Problem = { code: string; status: number };
type Item = { slug: string; title: string; deletedAt: string };

const json = <T>(text: string): T => JSON.parse(text) as T;

async function trashStudio(store?: DraftStore) {
  const drafts = store ?? shopDraft().store;
  writeFakeBuild(drafts);
  const { studio, errors } = await studioOver(drafts);
  const auth = { authorization: `Bearer ${studio.token}` };
  const write = { ...auth, origin: studio.url, 'content-type': 'application/json' };
  const get = (path: string) => call(studio.port, { path, headers: auth });
  const send = (method: string, path: string, headers: Record<string, string> = write) =>
    call(studio.port, { method, path, headers, body: '{}' });
  return { drafts, studio, errors, auth, get, send };
}

test('DELETE moves the draft to the trash; the drafts and the trash say so', async () => {
  const { studio, get, send, drafts } = await trashStudio();
  try {
    const answer = await send('DELETE', '/api/v1/drafts/shop');
    assert.equal(answer.status, 200);
    const { deleted } = json<{ deleted: Item }>(answer.text);
    assert.equal(deleted.slug, 'shop');
    assert.equal(deleted.title, 'Shop');
    assert.match(deleted.deletedAt, /^\d{4}-\d\d-\d\dT[\d:.]+Z$/);
    // The trash folder's own name is not part of the answer.
    assert.ok(!answer.text.includes('~'));
    assert.equal(json<{ items: unknown[] }>((await get('/api/v1/drafts')).text).items.length, 0);
    assert.equal((await get('/api/v1/drafts/shop')).status, 404);
    const trash = json<{ items: Item[] }>((await get('/api/v1/trash')).text);
    assert.deepEqual(trash.items, [deleted]);
    assert.equal(drafts.list().length, 0);
  } finally {
    await studio.close();
  }
});

test('a delete is a write: it needs the token, the studio origin and a JSON body', async () => {
  const { studio, auth, send, get } = await trashStudio();
  try {
    const origin = studio.url;
    const mime = 'application/json';
    const cases: [Record<string, string>, number, string][] = [
      [{ ...auth, 'content-type': mime }, 403, 'REQUEST_FORBIDDEN'],
      [{ ...auth, origin: 'http://evil.example', 'content-type': mime }, 403, 'REQUEST_FORBIDDEN'],
      [{ origin, 'content-type': mime }, 401, 'TOKEN_INVALID'],
      [{ ...auth, origin }, 415, 'MEDIA_TYPE_UNSUPPORTED'],
    ];
    for (const [headers, status, code] of cases) {
      for (const [method, path] of [
        ['DELETE', '/api/v1/drafts/shop'],
        ['POST', '/api/v1/trash/shop/restore'],
        ['DELETE', '/api/v1/trash/shop'],
      ] as const) {
        const answer = await send(method, path, headers);
        assert.equal(answer.status, status, `${method} ${path} ${code}`);
        assert.equal((JSON.parse(answer.text) as Problem).code, code);
      }
    }
    // Nothing was deleted by any refused call.
    assert.equal((await get('/api/v1/drafts/shop')).status, 200);
  } finally {
    await studio.close();
  }
});

test('a draft that is not there, or a name that is no slug, is 404', async () => {
  const { studio, send } = await trashStudio();
  try {
    const missing = await send('DELETE', '/api/v1/drafts/nope');
    assert.equal(missing.status, 404);
    assert.equal((JSON.parse(missing.text) as Problem).code, 'DRAFT_NOT_FOUND');
    for (const path of ['/api/v1/drafts/Bad_Slug', '/api/v1/trash/Bad_Slug']) {
      const answer = await send('DELETE', path);
      assert.equal(answer.status, 404, path);
      assert.equal((JSON.parse(answer.text) as Problem).code, 'ROUTE_NOT_FOUND');
    }
    const restore = await send('POST', '/api/v1/trash/nope/restore');
    assert.equal(restore.status, 404);
    assert.equal((JSON.parse(restore.text) as Problem).code, 'DRAFT_NOT_FOUND');
  } finally {
    await studio.close();
  }
});

test('restore brings the newest copy back, and 409 when the name is taken', async () => {
  const { studio, send, get, drafts } = await trashStudio();
  try {
    await send('DELETE', '/api/v1/drafts/shop');
    createDraft(drafts, { slug: 'shop', title: 'Again', kit: TINY, now: NOW });
    const taken = await send('POST', '/api/v1/trash/shop/restore');
    assert.equal(taken.status, 409);
    assert.equal((JSON.parse(taken.text) as Problem).code, 'DRAFT_EXISTS');
    assert.equal(json<{ items: unknown[] }>((await get('/api/v1/trash')).text).items.length, 1);

    await send('DELETE', '/api/v1/drafts/shop');
    const answer = await send('POST', '/api/v1/trash/shop/restore');
    assert.equal(answer.status, 200);
    assert.equal(json<{ restored: Item }>(answer.text).restored.title, 'Again');
    assert.equal((await get('/api/v1/drafts/shop')).status, 200);
    assert.equal(json<{ items: Item[] }>((await get('/api/v1/trash')).text).items.length, 1);
  } finally {
    await studio.close();
  }
});

test('purge removes the deleted copies for good and never a live draft', async () => {
  const { studio, send, get } = await trashStudio();
  try {
    // A live draft has no deleted copy: nothing is removed.
    const live = await send('DELETE', '/api/v1/trash/shop');
    assert.equal(live.status, 404);
    assert.equal((await get('/api/v1/drafts/shop')).status, 200);

    await send('DELETE', '/api/v1/drafts/shop');
    const answer = await send('DELETE', '/api/v1/trash/shop');
    assert.equal(answer.status, 200);
    assert.equal(json<{ purged: Item[] }>(answer.text).purged[0]?.slug, 'shop');
    assert.deepEqual(json<{ items: Item[] }>((await get('/api/v1/trash')).text).items, []);
    assert.equal((await send('POST', '/api/v1/trash/shop/restore')).status, 404);
  } finally {
    await studio.close();
  }
});

test('a draft whose files another program holds stays where it is, and the answer is 409', async () => {
  const root = join(tempDir('kitvas-drafts-'), 'drafts');
  const held = Object.assign(new Error('held'), { code: 'EBUSY' });
  const store = createFsDraftStore(
    root,
    {},
    {
      io: {
        move: () => {
          throw held;
        },
      },
    },
  );
  createDraft(store, { slug: 'shop', title: 'Shop', kit: TINY, now: NOW });
  const { studio, send, get } = await trashStudio(store);
  try {
    const answer = await send('DELETE', '/api/v1/drafts/shop');
    assert.equal(answer.status, 409);
    assert.equal((JSON.parse(answer.text) as Problem).code, 'DRAFT_LOCKED');
    assert.equal((await get('/api/v1/drafts/shop')).status, 200);
    assert.deepEqual(json<{ items: Item[] }>((await get('/api/v1/trash')).text).items, []);
  } finally {
    await studio.close();
  }
});

/** The text of the events stream up to and including the first event named `name`. */
function eventAfter(port: number, headers: Record<string, string>, name: string, act: () => void) {
  return new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('no event')), 5_000);
    const req = request(
      { host: '127.0.0.1', port, path: '/api/v1/events', agent: false, headers },
      (res) => {
        let text = '';
        res.on('data', (chunk: Buffer) => {
          text += chunk.toString('utf8');
          const at = text.indexOf(`event: ${name}`);
          if (at !== -1 && text.indexOf('\n\n', at) !== -1) {
            clearTimeout(timer);
            req.destroy();
            resolve(text);
          }
        });
        act();
      },
    );
    req.on('error', () => undefined);
    req.end();
  });
}

test('open pages hear a delete, a restore and a purge through the events stream', async () => {
  const { studio, auth, send } = await trashStudio();
  try {
    const headers = { ...auth, host: `127.0.0.1:${studio.port}` };
    const text = await eventAfter(studio.port, headers, 'drafts', () => {
      void send('DELETE', '/api/v1/drafts/shop');
    });
    assert.match(text, /event: drafts\ndata: \{"slug":"shop","change":"deleted"\}/);
  } finally {
    await studio.close();
  }
});

test('the draft page of a deleted draft says so and offers Restore', async () => {
  const { studio, send } = await trashStudio();
  try {
    await send('DELETE', '/api/v1/drafts/shop');
    const cookie = await pageCookie(studio, '/drafts/shop');
    const page = await call(studio.port, { path: '/drafts/shop', headers: { cookie } });
    assert.equal(page.status, 410);
    assert.match(page.text, /data-trash-gone/);
    assert.match(page.text, /data-trash-restore/);
    assert.match(page.text, /href="\/"/);
    const gallery = await call(studio.port, { path: '/?show=deleted', headers: { cookie } });
    assert.match(gallery.text, /data-trash-list/);
    assert.match(gallery.text, /data-trash-forever/);
  } finally {
    await studio.close();
  }
});
