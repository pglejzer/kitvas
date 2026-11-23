import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { EditStudioBody } from '../../../client/channel/edit-protocol.ts';
import type { Bridge } from '../../../client/studio/edit/bridge.ts';
import {
  createLiveFrame,
  frameAddress,
  type LiveFrameIo,
  pageAddress,
  WAIT_FOR_NEXT_MS,
  withHashOf,
} from '../../../client/studio/edit/live-frame.ts';
import { createStore } from '../../../client/studio/edit/store.ts';
import type { Frame } from '../../../client/studio/frames.ts';
import type { EditState } from '../../../src/studio/api/edit-schemas.ts';
import { fakeClock } from '../../helpers/fake-clock.ts';

const HERO = 'src/tsx/sections/Hero.tsx';
const CHANNEL = 'c'.repeat(20);
const HASH = `#kitvas=${CHANNEL}&studio=5173`;
const DRAFT = 'http://kitvas.localhost:5174/f/key123/shop';
const FRAME = `${DRAFT}/v2/html/index.html?state=default${HASH}`;
/** The same draft after the studio started again: another port, key and channel. */
const SERVED = 'http://kitvas.localhost:5180/f/newkey/shop/v2/html/index.html';
const OTHER_HASH = `#kitvas=${'d'.repeat(20)}&studio=5173`;
const PAGE = 'http://kitvas.localhost:5173/drafts/shop?version=2&state=default&width=1280';

/** Lets every promise that can settle now settle. */
const settled = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

const editState = (version: number, etags: Record<string, string> = {}): EditState => ({
  slug: 'shop',
  version,
  session: null,
  format: 'scss',
  etags,
  tokens: [],
});

const source = (fields: Record<string, unknown>) => ({
  event: 'source',
  data: JSON.stringify({ slug: 'shop', version: 2, files: {}, by: 'other', ...fields }),
});
const build = (version: number, state = 'succeeded') => ({
  event: 'build',
  data: JSON.stringify({ slug: 'shop', version, state, ms: 300 }),
});

/** An editor in edit mode on version 2, with a fake frame, bridge, page and clock. */
function setup() {
  const clock = fakeClock(1_000);
  const store = createStore('shop');
  store.set({ on: true, edit: editState(2, { [HERO]: '"old"' }), etags: { [HERO]: '"old"' } });
  const element = { src: FRAME };
  const frame: Frame = {
    role: 'current',
    channel: CHANNEL,
    element: element as unknown as HTMLIFrameElement,
    ready: true,
  };
  const sent: EditStudioBody[] = [];
  let requests = 0;
  const bridge: Bridge = {
    frame,
    send: (body) => {
      sent.push(body);
    },
    on: () => () => undefined,
    receive: () => undefined,
    nextRequest: () => {
      requests += 1;
      return requests;
    },
  };
  const main: { dataset: DOMStringMap } = { dataset: { state: 'default', version: '2' } };
  const pages: string[] = [];
  const reads: string[] = [];
  const answers = { state: editState(2), served: undefined as string | undefined };
  const io: LiveFrameIo = {
    getEditState: async (slug) => {
      reads.push(slug);
      return { ok: true, status: 200, body: answers.state };
    },
    after: (ms, fn) => clock.after(ms, fn),
    now: () => clock.now(),
    page: () => pages.at(-1) ?? PAGE,
    replacePage: (href) => {
      pages.push(href);
    },
    servedFrame: async () => answers.served,
    claudeLabel: () => 'Edited the code',
  };
  const live = createLiveFrame({ slug: 'shop', store, bridge, main }, io);
  return { clock, store, element, frame, sent, main, pages, reads, answers, live };
}

test('the frame address changes only its version, state and live number', () => {
  assert.equal(
    frameAddress(FRAME, { version: 12, state: 'empty', live: 4 }),
    `${DRAFT}/v12/html/index.html?state=empty&live=4${HASH}`,
  );
  assert.equal(
    frameAddress(FRAME, { version: 3, state: undefined, live: 1 }),
    `${DRAFT}/v3/html/index.html?state=default&live=1${HASH}`,
  );
  const kitFrame = 'http://kitvas.localhost:5174/k/key123/base/html/index.html?example=Button.1';
  assert.equal(frameAddress(kitFrame, { version: 3, state: 'default', live: 1 }), undefined);
  assert.equal(
    frameAddress('not an address', { version: 3, state: 'default', live: 1 }),
    undefined,
  );
});

test('the page address names the new version only when it named one', () => {
  assert.equal(pageAddress(PAGE, 3), PAGE.replace('version=2', 'version=3'));
  const latest = 'http://kitvas.localhost:5173/drafts/shop?state=default';
  assert.equal(pageAddress(latest, 3), latest);
});

test('the address the studio serves now keeps the channel the page and frame talk on', () => {
  assert.equal(withHashOf(`${SERVED}${OTHER_HASH}`, FRAME), `${SERVED}${HASH}`);
  assert.equal(withHashOf('', FRAME), undefined);
});

test('a change by Claude updates the ETags and adds a line to the change list', () => {
  const { store, live } = setup();
  live.hear(source({ files: { [HERO]: '"new"' } }));
  assert.deepEqual(store.get().etags, { [HERO]: '"new"' });
  assert.deepEqual(store.get().changes, [
    { by: 'claude', id: null, label: 'Edited the code', files: [HERO], offKit: false, at: 1_000 },
  ]);
});

test("the editor's own write adds no line, and ETags it already has change nothing", () => {
  const { store, live } = setup();
  const before = store.get();
  live.hear(source({ files: { [HERO]: '"old"' }, by: 'editor' }));
  assert.equal(store.get(), before, 'the store was not set, so no panel reads again');
  live.hear(source({ files: { [HERO]: '"mine"' }, by: 'editor' }));
  assert.deepEqual(store.get().etags, { [HERO]: '"mine"' });
  assert.deepEqual(store.get().changes, []);
});

test('another draft or an older version leaves the editor as it is', () => {
  const { store, live } = setup();
  const before = store.get();
  live.hear(source({ slug: 'cart', files: { [HERO]: '"cart"' } }));
  live.hear(source({ version: 1, files: { [HERO]: '"v1"' } }));
  assert.equal(store.get(), before);
});

test('a newer version by Claude ends the session: the state is read again, undo steps go', async () => {
  const { store, reads, answers, live } = setup();
  store.set({ undo: [{ ops: [], label: 'Set gap' }] });
  answers.state = editState(3, { [HERO]: '"v3"' });
  live.hear(source({ version: 3, files: { [HERO]: '"v3"' } }));
  await settled();
  assert.deepEqual(reads, ['shop']);
  assert.equal(store.get().edit?.version, 3);
  assert.deepEqual(store.get().etags, { [HERO]: '"v3"' });
  assert.deepEqual(store.get().undo, []);
  assert.equal(store.get().changes.length, 1, "Claude's change is in the list");
});

test('while an edit is on its way, a newer version waits for its answer', async () => {
  const { store, reads, live } = setup();
  store.set({ busy: true });
  live.hear(source({ version: 3, files: { [HERO]: '"v3"' }, by: 'editor' }));
  await settled();
  assert.deepEqual(reads, []);
  // The answer of the first edit of a session moved the editor to version 3: nothing to read.
  store.set({ busy: false, edit: editState(3) });
  await settled();
  assert.deepEqual(reads, []);
  // This time the answer did not move it: Claude started version 4.
  store.set({ busy: true });
  live.hear(source({ version: 4, files: { [HERO]: '"v4"' } }));
  store.set({ busy: false });
  await settled();
  assert.deepEqual(reads, ['shop']);
});

test('a finished build loads the frame again at its version, and the editor carries on', () => {
  const { store, element, frame, sent, main, pages, live } = setup();
  // The first edit of a session started version 3; the history moved the editor there.
  store.set({ edit: editState(3), selection: ['sections/Hero:section'] });
  live.hear(source({ version: 3, files: { [HERO]: '"new"' }, by: 'editor' }));
  live.hear(build(3));
  assert.equal(element.src, frameAddress(FRAME, { version: 3, state: 'default', live: 1 }));
  assert.equal(frame.ready, false);
  assert.equal(main.dataset.version, '3');
  assert.deepEqual(pages, [PAGE.replace('version=2', 'version=3')]);
  assert.deepEqual(sent, []);
  live.ready();
  assert.deepEqual(sent, [
    { type: 'edit', on: true },
    { type: 'select', ids: ['sections/Hero:section'] },
    { type: 'tree', request: 1 },
  ]);
  live.ready();
  assert.equal(sent.length, 3, 'a ready the frame says again changes nothing');
});

test('a build while another change is on its way waits for the next build, then loads once', () => {
  const { clock, element, live } = setup();
  live.hear(source({ files: { [HERO]: '"a"' } }));
  live.hear(source({ files: { [HERO]: '"b"' } }));
  live.hear(build(2));
  assert.equal(element.src, FRAME, 'the first build waits');
  live.hear(build(2));
  assert.equal(element.src, frameAddress(FRAME, { version: 2, state: 'default', live: 1 }));
  assert.equal(clock.pending(), 0);
});

test('an edit on its way also makes a finished build wait', () => {
  const { store, element, live } = setup();
  live.hear(source({ files: { [HERO]: '"a"' } }));
  store.set({ busy: true });
  live.hear(build(2));
  assert.equal(element.src, FRAME);
});

test('a build that waits loads after 3 s, or as soon as the next build fails', () => {
  const { clock, element, live } = setup();
  live.hear(source({ files: { [HERO]: '"a"' } }));
  live.hear(source({ files: { [HERO]: '"b"' } }));
  live.hear(build(2));
  clock.advance(WAIT_FOR_NEXT_MS - 1);
  assert.equal(element.src, FRAME);
  clock.advance(1);
  assert.match(element.src, /live=1#/);
  live.hear(source({ files: { [HERO]: '"c"' } }));
  live.hear(source({ files: { [HERO]: '"d"' } }));
  live.hear(build(2));
  live.hear(build(2, 'failed'));
  assert.match(element.src, /live=2#/);
  live.hear(build(2, 'failed'));
  assert.match(element.src, /live=2#/, 'a failed build alone loads nothing');
});

test('outside edit mode the frame is left to the page, which loads itself again', () => {
  const { store, element, sent, live } = setup();
  store.set({ on: false });
  live.hear(source({ files: { [HERO]: '"a"' } }));
  live.hear(build(2));
  assert.equal(element.src, FRAME);
  assert.deepEqual(sent, []);
});

test('a reset reads the state again and loads the frame from the address served now', async () => {
  const { store, element, answers, live } = setup();
  answers.state = editState(2, { [HERO]: '"fresh"' });
  answers.served = `${SERVED}?state=default${OTHER_HASH}`;
  live.hear({ event: 'reset', data: '{}' });
  await settled();
  assert.deepEqual(store.get().etags, { [HERO]: '"fresh"' });
  assert.equal(element.src, `${SERVED}?state=default&live=1${HASH}`);
});
