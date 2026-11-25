import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createDraft, type DraftStore } from '../../../src/drafts/index.ts';
import { KitvasError } from '../../../src/shared/index.ts';
import {
  LISTEN_GRACE_MS,
  type NewRequest,
  TAKEN_TIMEOUT_MS,
} from '../../../src/studio/api/requests/request-schemas.ts';
import type { EventHub, EventType } from '../../../src/studio/events/event-hub.ts';
import { RequestError } from '../../../src/studio/http/problem.ts';
import { createInbox, type Inbox } from '../../../src/studio/inbox/inbox.ts';
import type { Timers } from '../../../src/studio/requests/listening.ts';
import { readRequests } from '../../../src/studio/requests/request-file.ts';
import { createRequestService } from '../../../src/studio/requests/requests.ts';
import { NOW, shopDraft, TINY, tempDrafts } from '../../helpers/drafts.ts';
import { fakeClock } from '../../helpers/fake-clock.ts';
import { builtinKits } from '../../helpers/kits.ts';
import { t } from '../../helpers/translate.ts';

const BUTTON = 'sections/Hero:section/Button';
const SAY: NewRequest = {
  kind: 'say',
  elements: [BUTTON],
  context: { width: null, state: null },
  text: 'Make it stand out',
};
const VARIANTS = {
  kind: 'variants' as const,
  variants: [{ label: 'Bold', changes: [{ kind: 'text' as const, id: BUTTON, value: 'Go' }] }],
};

type Heard = { type: EventType; data: unknown };

/** A studio's request service with no editor: nothing can be inspected, so nothing is stale. */
function setup(store: DraftStore = shopDraft().store) {
  const clock = fakeClock(NOW.getTime());
  const now = () => new Date(clock.now());
  const timers: Timers = { set: (run, ms) => clock.after(ms, run) };
  const heard: Heard[] = [];
  const events: EventHub = {
    publish: (type, data) => {
      heard.push({ type, data });
    },
    open: () => undefined,
    close: () => undefined,
    count: () => 0,
  };
  const inbox: Inbox = createInbox({ now, publish: () => undefined });
  const host = { drafts: store, kits: builtinKits(), events, inbox, now, t };
  const service = createRequestService(host, timers);
  /** Slugs told by `requests` events since the last call; the `listening` events go with them. */
  const told = (): string[] =>
    heard
      .splice(0, heard.length)
      .filter((one) => one.type !== 'listening')
      .map((one) => slugOf(one));
  return { store, clock, heard, inbox, service, told };
}

function slugOf(one: Heard): string {
  const data = one.data;
  if (one.type !== 'requests' || typeof data !== 'object' || data === null) return `${one.type}?`;
  return 'slug' in data ? String(data.slug) : '?';
}

const codeOf = (code: string) => (error: unknown) =>
  error instanceof KitvasError && error.code === code;

test('a request waits on disk, a take hands it to Claude, and an answer closes it', async () => {
  const { store, clock, service, told } = setup();
  assert.equal((await service.list('shop')).listening.state, 'off');
  const made = await service.create('shop', SAY);
  assert.equal(made.status, 'waiting');
  assert.equal(made.stale, false);
  assert.deepEqual(made.elements, [BUTTON]);
  assert.deepEqual(told(), ['shop']);
  assert.equal(readRequests(store, 'shop').length, 1);
  assert.equal(service.hasWaiting(), true);

  const handed = service.ended(true);
  assert.deepEqual(handed, [
    { id: made.id, slug: 'shop', kind: 'say', text: 'Make it stand out', elements: [BUTTON] },
  ]);
  assert.equal(service.hasWaiting(), false);
  const working = await service.list('shop');
  assert.equal(working.requests[0]?.status, 'taken');
  assert.equal(working.listening.state, 'working');
  assert.equal(working.listening.since, NOW.toISOString());
  told();

  clock.advance(2_000);
  const answered = await service.settle(made.id, VARIANTS);
  assert.equal(answered.status, 'answered');
  assert.deepEqual(answered.answer, VARIANTS);
  // Claude was seen a moment ago: still listening until the grace ends.
  assert.equal((await service.list('shop')).listening.state, 'listening');
  assert.deepEqual(told(), ['shop']);
  clock.advance(LISTEN_GRACE_MS + 1);
  assert.equal((await service.list('shop')).listening.state, 'off');
  assert.deepEqual(told(), ['shop'], 'the end of the grace is told by itself');
});

test('a taken request whose session is gone waits again after 15 minutes', async () => {
  const { clock, inbox, service } = setup();
  const made = await service.create('shop', SAY);
  service.ended(true);
  // The next take of a new session waits; the expiry hands the request back to it at once.
  const waiting = inbox.wait(60_000);
  service.began();
  clock.advance(TAKEN_TIMEOUT_MS - 1);
  assert.equal(inbox.waiting(), true);
  clock.advance(2);
  assert.deepEqual(await waiting.items, []);
  assert.equal(waiting.given(), true);
  const again = service.ended(true);
  assert.deepEqual(
    again.map((one) => one.id),
    [made.id],
  );
  // Taken again: the session that holds it now may answer it.
  const done = await service.settle(made.id, { kind: 'done', message: 'Done' });
  assert.equal(done.status, 'answered');
});

test('a waiting request survives a restart of the studio', async () => {
  const first = setup();
  const made = await first.service.create('shop', SAY);
  first.inbox.close();
  const second = setup(first.store);
  assert.equal(second.service.hasWaiting(), true);
  assert.deepEqual(
    second.service.ended(true).map((one) => one.id),
    [made.id],
  );
});

test('only a taken request takes an answer; a dropped one never does', async () => {
  const { service } = setup();
  const made = await service.create('shop', SAY);
  await assert.rejects(service.settle(made.id, VARIANTS), codeOf('REQUEST_NOT_TAKEN'));
  service.ended(true);
  const dropped = await service.drop('shop', made.id);
  assert.equal(dropped.status, 'dropped');
  await assert.rejects(
    service.settle(made.id, { kind: 'failed', reason: 'No' }),
    codeOf('REQUEST_NOT_TAKEN'),
  );
  assert.deepEqual(service.ended(true), []);
  const unknown = '00000000-0000-4000-8000-000000000009';
  await assert.rejects(service.drop('shop', unknown), codeOf('REQUEST_NOT_FOUND'));
  await assert.rejects(service.settle(unknown, VARIANTS), codeOf('REQUEST_NOT_FOUND'));
  await assert.rejects(service.show(unknown), codeOf('REQUEST_NOT_FOUND'));
  await assert.rejects(service.list('nope'), codeOf('DRAFT_NOT_FOUND'));
});

test('a variant that names a file outside the sources is refused with its pointer', async () => {
  const { service } = setup();
  const made = await service.create('shop', SAY);
  service.ended(true);
  const bad = {
    kind: 'variants' as const,
    variants: [{ label: 'Out', changes: [{ kind: 'text' as const, id: '../x:div', value: 'Go' }] }],
  };
  await assert.rejects(service.settle(made.id, bad), (error: unknown) => {
    assert.ok(error instanceof RequestError);
    assert.equal(error.code, 'BODY_INVALID');
    assert.deepEqual(
      error.errors.map((one) => one.pointer),
      ['/variants/0/changes/0/id'],
    );
    return true;
  });
  // Still taken: a corrected answer is taken.
  assert.equal((await service.settle(made.id, VARIANTS)).status, 'answered');
});

test('a new listening state is told to every draft, a request change only to its own', async () => {
  const { store } = shopDraft();
  createDraft(store, { slug: 'blog', title: 'Blog', kit: TINY, now: NOW });
  const { inbox, service, told } = setup(store);
  await service.create('blog', SAY);
  assert.deepEqual(told(), ['blog']);
  const waiting = inbox.wait(60_000);
  service.began();
  assert.deepEqual(told().sort(), ['blog', 'shop']);
  waiting.cancel();
  await waiting.items;
  assert.equal(waiting.given(), false, 'a take whose caller left is handed nothing');
  assert.deepEqual(service.ended(waiting.given()), []);
  assert.equal(service.hasWaiting(), true);
});

test('a new listening state is told once for the studio, also with no drafts', async () => {
  const { heard, inbox, service } = setup(tempDrafts().store);
  assert.deepEqual(service.listening(), { state: 'off', since: null });
  const waiting = inbox.wait(60_000);
  service.began();
  const listening = { state: 'listening', since: NOW.toISOString() };
  assert.deepEqual(heard, [{ type: 'listening', data: listening }]);
  assert.deepEqual(service.listening(), listening);
  // The same state read again is no change.
  service.began();
  assert.equal(heard.length, 1);
  waiting.cancel();
  await waiting.items;
});

test('a new state with drafts is told once for the studio and once to each draft', async () => {
  const { store } = shopDraft();
  createDraft(store, { slug: 'blog', title: 'Blog', kit: TINY, now: NOW });
  const { heard, inbox, service } = setup(store);
  const waiting = inbox.wait(60_000);
  service.began();
  assert.deepEqual(
    heard.map((one) => one.type),
    ['listening', 'requests', 'requests'],
  );
  waiting.cancel();
  await waiting.items;
});

test('once the studio stops, a take is handed nothing and no timer is left', async () => {
  const { clock, inbox, service } = setup();
  await service.create('shop', SAY);
  service.ended(true);
  assert.ok(clock.pending() > 0);
  inbox.close();
  assert.equal(clock.pending(), 0);
  assert.deepEqual(service.ended(true), []);
});
