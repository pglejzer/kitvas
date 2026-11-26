import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { EditStudioBody } from '../../../../../client/channel/edit-protocol.ts';
import { SWAP_TIMEOUT_MS } from '../../../../../client/frame/page/swap.ts';
import type { Bridge } from '../../../../../client/studio/edit/bridge.ts';
import { createStore } from '../../../../../client/studio/edit/store.ts';
import {
  createLiveFrame,
  frameAddress,
  type LiveFrameIo,
  pageAddress,
  SWAP_ANSWER_MS,
  samePage,
  WAIT_FOR_NEXT_MS,
  withHashOf,
  withScrollAt,
} from '../../../../../client/studio/edit/sync/live-frame.ts';
import type { Frame } from '../../../../../client/studio/frames.ts';
import type { EditState } from '../../../../../src/studio/api/edit/edit-schemas.ts';
import { fakeClock } from '../../../../helpers/studio/fake-clock.ts';

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

/** Where a card's frame goes when it loads build `live` of `version`. */
const loaded = (from: string, live: number, version = 2): string | undefined =>
  frameAddress(from, { version, state: 'default', live });

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
  /** The width cards, the edit card first; a test adds more. */
  const cards: Frame[] = [frame];
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
    frames: () => cards,
    sendLive: () => undefined,
    onLive: () => () => undefined,
    receiveLive: () => undefined,
  };
  const main: { dataset: DOMStringMap } = { dataset: { state: 'default', version: '2' } };
  const pages: string[] = [];
  const reads: string[] = [];
  /** The cards asked to take a build in place, each with the build's number. */
  const swaps: [Frame, number][] = [];
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
    swap: (card, live) => {
      swaps.push([card, live]);
    },
  };
  const live = createLiveFrame({ slug: 'shop', store, bridge, main }, io);
  return { clock, store, element, frame, cards, sent, main, pages, reads, swaps, answers, live };
}

const WIDE_HASH = `#kitvas=${'w'.repeat(20)}&studio=5173`;
const WIDE = `${DRAFT}/v2/html/index.html?state=default${WIDE_HASH}`;

/** A second width card on its own channel. */
function wideCard(): { card: Frame; element: { src: string } } {
  const element = { src: WIDE };
  const card: Frame = {
    role: 'current',
    channel: 'w'.repeat(20),
    element: element as unknown as HTMLIFrameElement,
    ready: true,
  };
  return { card, element };
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

test('a frame shows the page of an address with the same origin, key, draft and version', () => {
  assert.equal(samePage(FRAME, loaded(FRAME, 9) ?? ''), true);
  assert.equal(samePage(FRAME, `${DRAFT}/v2/html/index.html?state=empty${OTHER_HASH}`), true);
  assert.equal(samePage(FRAME, loaded(FRAME, 9, 3) ?? ''), false, 'another version');
  assert.equal(samePage(FRAME, `${SERVED}${HASH}`), false, 'another port and key');
  assert.equal(samePage(FRAME, FRAME.replace('/shop/', '/cart/')), false, 'another draft');
  assert.equal(samePage('', FRAME), false);
  assert.equal(samePage(FRAME, 'not an address'), false);
});

test('a frame that fails says so before the studio stops waiting for it', () => {
  // The sheet and the bundle each get `SWAP_TIMEOUT_MS` (client/frame/page/swap.ts).
  assert.ok(2 * SWAP_TIMEOUT_MS < SWAP_ANSWER_MS);
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

test('a build of the version a card shows is taken in place: its frame keeps its address', () => {
  const { clock, store, element, frame, sent, pages, swaps, live } = setup();
  store.set({ selection: ['sections/Hero:section'] });
  const builds = store.get().builds;
  live.hear(source({ files: { [HERO]: '"new"' }, by: 'editor' }));
  live.hear(build(2));
  assert.deepEqual(swaps, [[frame, 1]]);
  assert.equal(element.src, FRAME, 'nothing is loaded');
  assert.equal(frame.ready, true);
  assert.deepEqual(pages, [], 'the page names that version already');
  assert.deepEqual(sent, []);
  assert.equal(store.get().builds, builds, 'the build does not show yet');
  live.ready(frame, 1);
  assert.equal(store.get().builds, builds + 1);
  assert.deepEqual(sent, [
    { type: 'edit', on: true },
    { type: 'select', ids: ['sections/Hero:section'] },
    { type: 'tree', request: 1 },
  ]);
  assert.equal(clock.pending(), 0, 'no answer is waited for any more');
  live.ready(frame, 1);
  assert.equal(sent.length, 3, 'a ready the frame says again changes nothing');
  assert.equal(store.get().builds, builds + 1);
});

test('a build of another version loads the frame again at that version, and the editor carries on', () => {
  const { store, element, frame, sent, main, pages, swaps, live } = setup();
  // The first edit of a session started version 3; the history moved the editor there.
  store.set({ edit: editState(3), selection: ['sections/Hero:section'] });
  live.hear(source({ version: 3, files: { [HERO]: '"new"' }, by: 'editor' }));
  live.hear(build(3));
  assert.deepEqual(swaps, [], 'the page in the frame is the one of version 2');
  assert.equal(element.src, loaded(FRAME, 1, 3));
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

test('a frame that has not spoken yet is not asked: it loads the build', () => {
  const { element, frame, swaps, live } = setup();
  frame.ready = false;
  live.hear(build(2));
  assert.deepEqual(swaps, []);
  assert.equal(element.src, loaded(FRAME, 1));
});

test('a card that cannot take the build in place loads its frame again', () => {
  const { clock, store, element, frame, live } = setup();
  const builds = store.get().builds;
  live.hear(build(2));
  live.swapped(frame, 1, 'failed');
  assert.equal(element.src, loaded(FRAME, 1));
  assert.equal(frame.ready, false);
  assert.equal(clock.pending(), 0);
  assert.equal(store.get().builds, builds);
  live.ready(frame);
  assert.equal(store.get().builds, builds + 1, 'the page that loaded shows the build');
});

test('a card that does not answer in time loads its frame again', () => {
  const { clock, store, element, frame, live } = setup();
  const builds = store.get().builds;
  live.hear(build(2));
  clock.advance(SWAP_ANSWER_MS - 1);
  assert.equal(element.src, FRAME);
  clock.advance(1);
  assert.equal(element.src, loaded(FRAME, 1));
  assert.equal(frame.ready, false);
  // What the page that leaves still says about the swap is not heard.
  live.ready(frame, 1);
  live.swapped(frame, 1, 'failed');
  assert.equal(store.get().builds, builds);
  live.ready(frame);
  assert.equal(store.get().builds, builds + 1);
});

test('a card that loads on its own while it is asked shows the build too', () => {
  const { clock, store, frame, live } = setup();
  const builds = store.get().builds;
  live.hear(build(2));
  live.ready(frame);
  assert.equal(store.get().builds, builds + 1);
  assert.equal(clock.pending(), 0);
});

test('a gesture in the card holds the swap: nothing times out, and it is asked again when free', () => {
  const { clock, store, element, frame, swaps, live } = setup();
  const builds = store.get().builds;
  live.hear(build(2));
  live.swapped(frame, 1, 'held');
  assert.equal(clock.pending(), 0);
  clock.advance(SWAP_ANSWER_MS * 4);
  assert.equal(element.src, FRAME, 'a gesture is never cut short by a load');
  live.swapped(frame, 1, 'free');
  assert.deepEqual(swaps, [
    [frame, 1],
    [frame, 1],
  ]);
  assert.equal(clock.pending(), 1, 'the answer is timed again');
  live.ready(frame, 1);
  assert.equal(store.get().builds, builds + 1);
});

test('when the gesture made a change of its own, the card waits for the build of that change', () => {
  const { store, element, frame, swaps, live } = setup();
  live.hear(build(2));
  live.swapped(frame, 1, 'held');
  // The drop the gesture ended with is on its way.
  store.set({ busy: true });
  live.swapped(frame, 1, 'free');
  assert.deepEqual(swaps, [[frame, 1]], 'the older build is not asked for again');
  store.set({ busy: false });
  live.hear(source({ files: { [HERO]: '"dropped"' }, by: 'editor' }));
  live.hear(build(2));
  assert.deepEqual(swaps, [
    [frame, 1],
    [frame, 2],
  ]);
  assert.equal(element.src, FRAME);
});

test('a card set free waits no longer than 3 s for the build of a change', () => {
  const { clock, frame, swaps, live } = setup();
  live.hear(build(2));
  live.swapped(frame, 1, 'held');
  live.hear(source({ files: { [HERO]: '"dropped"' }, by: 'editor' }));
  live.swapped(frame, 1, 'free');
  clock.advance(WAIT_FOR_NEXT_MS - 1);
  assert.equal(swaps.length, 1);
  clock.advance(1);
  assert.deepEqual(swaps, [
    [frame, 1],
    [frame, 2],
  ]);
});

test('an answer to an older swap is not the build asked for', () => {
  const { store, element, frame, swaps, live } = setup();
  const builds = store.get().builds;
  live.hear(build(2));
  live.hear(build(2));
  assert.deepEqual(swaps, [
    [frame, 1],
    [frame, 2],
  ]);
  live.ready(frame, 1);
  assert.equal(store.get().builds, builds, 'the older build is not the one to show');
  live.swapped(frame, 1, 'failed');
  assert.equal(element.src, FRAME, 'and its failure loads nothing');
  live.ready(frame, 2);
  assert.equal(store.get().builds, builds + 1);
});

test('a frame that was sent to another page meanwhile is not loaded over', () => {
  const { clock, element, frame, live } = setup();
  const older = FRAME.replace('/v2/', '/v1/');
  live.hear(build(2));
  // The timeline shows an older version in the card.
  element.src = older;
  frame.ready = false;
  clock.advance(SWAP_ANSWER_MS);
  assert.equal(element.src, older);
  live.hear(build(2));
  assert.equal(element.src, loaded(older, 2), 'the next build brings the card back');
});

test('a build while another change is on its way waits for the next build, then shows once', () => {
  const { clock, element, frame, swaps, live } = setup();
  live.hear(source({ files: { [HERO]: '"a"' } }));
  live.hear(source({ files: { [HERO]: '"b"' } }));
  live.hear(build(2));
  assert.deepEqual(swaps, [], 'the first build waits');
  live.hear(build(2));
  assert.deepEqual(swaps, [[frame, 1]]);
  assert.equal(element.src, FRAME);
  assert.equal(clock.pending(), 1, 'only the answer of the card is waited for');
});

test('an edit on its way also makes a finished build wait', () => {
  const { store, element, swaps, live } = setup();
  live.hear(source({ files: { [HERO]: '"a"' } }));
  store.set({ busy: true });
  live.hear(build(2));
  assert.equal(element.src, FRAME);
  assert.deepEqual(swaps, []);
});

test('a build that waits shows after 3 s, or as soon as the next build fails', () => {
  const { clock, element, frame, swaps, live } = setup();
  live.hear(source({ files: { [HERO]: '"a"' } }));
  live.hear(source({ files: { [HERO]: '"b"' } }));
  live.hear(build(2));
  clock.advance(WAIT_FOR_NEXT_MS - 1);
  assert.deepEqual(swaps, []);
  clock.advance(1);
  assert.deepEqual(swaps, [[frame, 1]]);
  live.hear(source({ files: { [HERO]: '"c"' } }));
  live.hear(source({ files: { [HERO]: '"d"' } }));
  live.hear(build(2));
  live.hear(build(2, 'failed'));
  assert.deepEqual(swaps, [
    [frame, 1],
    [frame, 2],
  ]);
  live.hear(build(2, 'failed'));
  assert.equal(swaps.length, 2, 'a failed build alone shows nothing');
  assert.equal(element.src, FRAME);
});

test('outside edit mode the frame is left to the page, which loads itself again', () => {
  const { store, element, sent, swaps, live } = setup();
  store.set({ on: false });
  live.hear(source({ files: { [HERO]: '"a"' } }));
  live.hear(build(2));
  assert.equal(element.src, FRAME);
  assert.deepEqual(swaps, []);
  assert.deepEqual(sent, []);
});

test('a reset reads the state again and loads the frame from the address served now', async () => {
  const { store, element, swaps, answers, live } = setup();
  answers.state = editState(2, { [HERO]: '"fresh"' });
  answers.served = `${SERVED}?state=default${OTHER_HASH}`;
  live.hear({ event: 'reset', data: '{}' });
  await settled();
  assert.deepEqual(store.get().etags, { [HERO]: '"fresh"' });
  assert.equal(element.src, `${SERVED}?state=default&live=1${HASH}`);
  assert.deepEqual(swaps, [], 'a new key is another page: nothing to take in place');
});

test('after a reset that left the address as it was, the cards take the build in place', async () => {
  const { element, frame, swaps, answers, live } = setup();
  answers.served = `${DRAFT}/v2/html/index.html?state=default${OTHER_HASH}`;
  live.hear({ event: 'reset', data: '{}' });
  await settled();
  assert.deepEqual(swaps, [[frame, 1]]);
  assert.equal(element.src, FRAME);
});

test('every width card takes a build on its own; the editor carries on once all show it', () => {
  const { store, element, frame, cards, sent, swaps, live } = setup();
  const wide = wideCard();
  cards.push(wide.card);
  const builds = store.get().builds;
  live.hear(build(2));
  assert.deepEqual(swaps, [
    [frame, 1],
    [wide.card, 1],
  ]);
  assert.equal(element.src, FRAME);
  assert.equal(wide.element.src, WIDE);
  assert.equal(wide.card.ready, true);
  live.ready(wide.card, 1);
  assert.equal(store.get().builds, builds, 'one card is not the build shown yet');
  assert.deepEqual(sent, []);
  live.ready(frame, 1);
  assert.equal(store.get().builds, builds + 1);
  assert.deepEqual(sent, [
    { type: 'edit', on: true },
    { type: 'tree', request: 1 },
  ]);
});

test('one card loads the build while the others take it in place', () => {
  const { store, element, frame, cards, live } = setup();
  const wide = wideCard();
  cards.push(wide.card);
  const builds = store.get().builds;
  live.hear(build(2));
  live.swapped(wide.card, 1, 'failed');
  assert.equal(wide.element.src, loaded(WIDE, 1));
  assert.equal(wide.card.ready, false);
  assert.equal(element.src, FRAME, 'the other card keeps its page');
  live.ready(frame, 1);
  assert.equal(store.get().builds, builds);
  live.ready(wide.card);
  assert.equal(store.get().builds, builds + 1);
});

test('a card closed while it takes a build does not keep the others waiting', () => {
  const { clock, store, frame, cards, live } = setup();
  const wide = wideCard();
  cards.push(wide.card);
  const builds = store.get().builds;
  live.hear(build(2));
  cards.pop();
  live.ready(frame, 1);
  assert.equal(store.get().builds, builds + 1);
  assert.equal(clock.pending(), 0, 'the closed card is not waited for either');
});

test('after a reset every card loads the address served now on its own channel', async () => {
  const { element, cards, answers, live } = setup();
  const wide = wideCard();
  cards.push(wide.card);
  answers.served = `${SERVED}?state=default${OTHER_HASH}`;
  live.hear({ event: 'reset', data: '{}' });
  await settled();
  assert.equal(element.src, `${SERVED}?state=default&live=1${HASH}`);
  assert.equal(wide.element.src, `${SERVED}?state=default&live=1${WIDE_HASH}`);
});

test('a failed swap that carried a scroll loads the frame again with it in the hash', () => {
  const { element, frame, live } = setup();
  live.hear(build(2));
  live.swapped(frame, 1, 'failed', { x: 0, y: 600 });
  assert.equal(element.src, `${loaded(FRAME, 1)?.replace(HASH, '')}${HASH}&scroll=0,600`);
  assert.equal(withScrollAt(FRAME, { x: 4, y: 5 }), `${FRAME}&scroll=4,5`);
  assert.equal(withScrollAt('not an address', { x: 4, y: 5 }), 'not an address');
});

test('a load for another reason leaves the scroll out of the address', () => {
  const failed = setup();
  failed.live.hear(build(2));
  failed.live.swapped(failed.frame, 1, 'failed');
  assert.equal(failed.element.src, loaded(FRAME, 1), 'a failed swap with no scroll');
  const silent = setup();
  silent.live.hear(build(2));
  silent.clock.advance(SWAP_ANSWER_MS);
  assert.equal(silent.element.src, loaded(FRAME, 1), 'no answer in time');
  assert.ok(!silent.element.src.includes('scroll='));
});
