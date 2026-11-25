import assert from 'node:assert/strict';
import { test } from 'node:test';
import type {
  EditFrameMessage,
  EditStudioBody,
} from '../../../../../client/channel/edit-protocol.ts';
import type { LiveStudioBody } from '../../../../../client/channel/live-protocol.ts';
import { createCardList } from '../../../../../client/studio/canvas/card-list.ts';
import type { Bridge } from '../../../../../client/studio/edit/bridge.ts';
import type { EditorContext } from '../../../../../client/studio/edit/context.ts';
import { mountContextBar, scopeOf } from '../../../../../client/studio/edit/props/context-bar.ts';
import { createStore } from '../../../../../client/studio/edit/store.ts';
import type { Frame } from '../../../../../client/studio/frames.ts';
import type { Inspect } from '../../../../../src/studio/api/edit/edit-schemas.ts';

const literal: Inspect['list'] = { kind: 'literal', count: 3, reason: null };

test('the switch shows for one element of a literal list in an SCSS draft', () => {
  assert.equal(scopeOf({ views: 1, count: 3, format: 'scss', list: literal }), 3);
});

test('the switch is left out for several elements, a Tailwind draft or one item', () => {
  assert.equal(scopeOf({ views: 2, count: 3, format: 'scss', list: literal }), null);
  assert.equal(scopeOf({ views: 1, count: 3, format: 'tailwind', list: literal }), null);
  assert.equal(scopeOf({ views: 1, count: 1, format: 'scss', list: literal }), null);
});

test('the switch is left out for a list that is not a literal array or no list', () => {
  const prop: Inspect['list'] = { kind: 'prop', count: null, reason: 'list-not-literal' };
  assert.equal(scopeOf({ views: 1, count: 3, format: 'scss', list: prop }), null);
  assert.equal(scopeOf({ views: 1, count: 3, format: 'scss', list: null }), null);
  assert.equal(scopeOf({ views: 1, count: 3, format: 'scss', list: undefined }), null);
});

const frameOf = (name: string, width: number): Frame => ({
  role: 'current',
  channel: name.repeat(20),
  element: { width: String(width) } as unknown as HTMLIFrameElement,
  ready: true,
});

/** The context bar over a phone card (the width shown) and a tablet card, in Edit. */
function setup() {
  const store = createStore('shop');
  const phone = frameOf('p', 390);
  const tablet = frameOf('t', 768);
  const list = createCardList(phone);
  list.add(tablet);
  const sent: EditStudioBody[] = [];
  const live: LiveStudioBody[] = [];
  const listeners: ((message: EditFrameMessage) => void)[] = [];
  const previews: (number | null)[] = [];
  const bridge = {
    get frame() {
      return list.edit();
    },
    frames: () => list.frames(),
    cards: list,
    send: (body: EditStudioBody) => sent.push(body),
    sendLive: (body: LiveStudioBody) => live.push(body),
    on: (listener: (message: EditFrameMessage) => void) => {
      listeners.push(listener);
      return () => undefined;
    },
    nextRequest: () => 7,
    setPreviewWidth: (width: number | null) => previews.push(width),
  } as unknown as Bridge;
  mountContextBar({ store, bridge } as unknown as EditorContext);
  store.set({ on: true, selection: ['sections/Hero:a'] });
  const hear = (message: EditFrameMessage): void => {
    for (const listener of listeners) listener(message);
  };
  return { store, list, tablet, sent, live, previews, hear };
}

test('edits go to every width from the phone card, and from 768 up from the tablet', () => {
  const { store, list, tablet, previews } = setup();
  assert.equal(store.get().context.width, null);
  list.setEdit(tablet);
  assert.equal(store.get().context.width, 768);
  assert.equal(previews.at(-1), 768, 'previews go to the cards from 768 up');
});

test("the kit's breakpoints come with the element's inspect answer", () => {
  const { store, list, tablet } = setup();
  list.setEdit(tablet);
  store.set({ inspected: { breakpoints: [640, 1024] } as unknown as Inspect });
  assert.equal(store.get().context.width, 640);
});

test('another edit card reads the computed values again from it', () => {
  const { store, list, tablet, sent, hear } = setup();
  list.setEdit(tablet);
  assert.deepEqual(sent, [{ type: 'inspect', request: 7, id: 'sections/Hero:a' }]);
  hear({
    kitvas: 1,
    channel: tablet.channel,
    type: 'inspected',
    request: 7,
    id: 'sections/Hero:a',
    found: true,
    styles: { color: 'rgb(0, 0, 0)' },
  });
  assert.deepEqual(store.get().computed, { color: 'rgb(0, 0, 0)' });
});

test('a state forces itself on the selection in every card; Focus forces focus', () => {
  const { store, live } = setup();
  store.set({ context: { ...store.get().context, state: 'hover' } });
  assert.deepEqual(live.at(-1), { type: 'force', ids: ['sections/Hero:a'], state: 'hover' });
  store.set({ context: { ...store.get().context, state: 'focus-visible' } });
  assert.deepEqual(live.at(-1), { type: 'force', ids: ['sections/Hero:a'], state: 'focus' });
  store.set({ context: { ...store.get().context, state: null } });
  assert.deepEqual(live.at(-1), { type: 'force', ids: [], state: null });
});

test('another selection lets the element rest and the bar goes back to Default', () => {
  const { store, live } = setup();
  store.set({ context: { ...store.get().context, state: 'active' } });
  store.set({ selection: ['sections/Hero:b'] });
  assert.equal(store.get().context.state, null);
  assert.deepEqual(live.at(-1), { type: 'force', ids: [], state: null });
});

test('leaving Edit leaves no forced state', () => {
  const { store, live } = setup();
  store.set({ context: { ...store.get().context, state: 'hover' } });
  store.set({ on: false, selection: [] });
  assert.equal(store.get().context.state, null);
  assert.deepEqual(live.at(-1), { type: 'force', ids: [], state: null });
  const count = live.length;
  store.set({ on: true });
  store.set({ on: false });
  assert.equal(live.length, count + 1, 'leaving again tells the cards to rest once more');
});
