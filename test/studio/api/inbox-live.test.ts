import assert from 'node:assert/strict';
import { test } from 'node:test';
import { openEvents } from '../../helpers/events.ts';
import { call, shopStudio } from '../../helpers/studio.ts';

type Item = { id: string; text: string; slug: string | null; element: string | null };

const json = <T>(text: string): T => JSON.parse(text) as T;
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function inboxStudio() {
  const { studio, errors } = await shopStudio();
  const auth = { authorization: `Bearer ${studio.token}` };
  const write = { ...auth, origin: studio.url, 'content-type': 'application/json' };
  // Taking removes notes, so it is a write: POST with the studio's Origin (ASVS 5.0 3.5.3).
  const take = (body: unknown = {}, headers: Record<string, string> = write) =>
    call(studio.port, {
      method: 'POST',
      path: '/api/v1/inbox/take',
      headers,
      body: JSON.stringify(body),
    });
  const add = (note: unknown, headers: Record<string, string> = write) =>
    call(studio.port, {
      method: 'POST',
      path: '/api/v1/inbox',
      headers,
      body: JSON.stringify(note),
    });
  return { studio, errors, auth, take, add };
}

const NOTE = { kind: 'note', slug: 'shop', element: 'hero-title', text: '  Bigger title  ' };

test('a note waits, the pages hear the count, a take empties the inbox', async () => {
  const { studio, errors, auth, take, add } = await inboxStudio();
  try {
    const stream = await openEvents(studio.port, auth);
    const added = await add(NOTE);
    assert.equal(added.status, 202);
    const note = json<Item>(added.text);
    assert.equal(note.text, 'Bigger title');
    assert.equal(note.element, 'hero-title');
    const counted = await stream.next();
    assert.equal(counted.event, 'inbox');
    assert.deepEqual(json(counted.data), { pending: 1 });
    const taken = await take();
    assert.equal(taken.status, 200);
    assert.equal(taken.headers['content-type'], 'application/json; charset=utf-8');
    assert.ok(taken.headers['content-security-policy']);
    assert.deepEqual(
      json<{ items: Item[] }>(taken.text).items.map((item) => item.id),
      [note.id],
    );
    assert.deepEqual(json((await stream.next()).data), { pending: 0 });
    assert.deepEqual(json<{ items: Item[] }>((await take()).text).items, []);
    stream.close();
  } finally {
    await studio.close();
  }
  assert.deepEqual(errors, []);
});

test('a waiting take gets the next note; bad input is refused', async () => {
  const { studio, auth, take, add } = await inboxStudio();
  try {
    const waiting = take({ timeout: 5 });
    await pause(100);
    assert.equal((await add(NOTE)).status, 202);
    assert.equal(json<{ items: Item[] }>((await waiting).text).items.length, 1);
    for (const body of [{ timeout: 601 }, { timeout: 'abc' }, { timeout: -1 }, { timeout: 1.5 }]) {
      const bad = await take(body);
      assert.equal(bad.status, 422, JSON.stringify(body));
      assert.equal(json<{ code: string }>(bad.text).code, 'BODY_INVALID');
    }
    assert.equal((await take({ extra: true })).status, 422);
    assert.equal((await add({ ...NOTE, text: '   ' })).status, 422);
    assert.equal((await add({ ...NOTE, extra: true })).status, 422);
    assert.equal((await add({ ...NOTE, slug: 'Not A Slug' })).status, 422);
    const noOrigin = { ...auth, 'content-type': 'application/json' };
    assert.equal((await add(NOTE, noOrigin)).status, 403);
    assert.equal((await take({}, noOrigin)).status, 403);
    const read = await call(studio.port, { path: '/api/v1/inbox', headers: auth });
    assert.equal(read.status, 405, 'a GET never takes notes');
    assert.equal(read.headers.allow, 'POST');
  } finally {
    await studio.close();
  }
});

test('stopping the studio answers a waiting take with nothing', async () => {
  const { studio, take } = await inboxStudio();
  const waiting = take({ timeout: 30 });
  await pause(100);
  await studio.close();
  const answer = await waiting;
  assert.equal(answer.status, 200);
  assert.deepEqual(json<{ items: Item[] }>(answer.text).items, []);
});
