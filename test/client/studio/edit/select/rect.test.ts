// The frame's selection rectangle on the page (ADR 0059, ADR 0065): its `rect` message becomes
// the selection with the copies it took. The rule itself is `rectSelection` (`copies.test.ts`).

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { CopyRef, EditFrameMessage } from '../../../../../client/channel/edit-protocol.ts';
import type { FrameListener } from '../../../../../client/studio/edit/bridge.ts';
import type { EditorContext } from '../../../../../client/studio/edit/context.ts';
import { mountRect } from '../../../../../client/studio/edit/select/rect.ts';
import { createStore, type Store } from '../../../../../client/studio/edit/store.ts';

const CARD = 'sections/Plans:section/Card';
const ROW = `${CARD}/ul/li`;
const TITLE = 'sections/Plans:section/h2';

const row = (item: number, path: number[]): CopyRef => ({ id: ROW, item, path });

const rect = (picks: CopyRef[], add = false): EditFrameMessage => ({
  kitvas: 1,
  channel: 'c1',
  type: 'rect',
  picks,
  add,
});

/** The page's side with a store and a bridge that hands `frame` messages to its listeners. */
function mounted(): { store: Store; frame(message: EditFrameMessage): void } {
  const store = createStore('demo');
  const listeners: FrameListener[] = [];
  const bridge = {
    on(listener: FrameListener) {
      listeners.push(listener);
      return () => undefined;
    },
  };
  mountRect({ store, bridge } as unknown as EditorContext);
  return {
    store,
    frame(message) {
      for (const listener of listeners) listener(message);
    },
  };
}

test('a rectangle over three rows of one plan selects those three copies', () => {
  const { store, frame } = mounted();
  const starter = [row(0, [0, 0]), row(1, [0, 1]), row(2, [0, 2])];
  // Only in edit mode.
  frame(rect(starter));
  assert.deepEqual(store.get().selection, []);
  store.set({ on: true });
  frame(rect(starter));
  assert.deepEqual(store.get().selection, [ROW]);
  assert.deepEqual(store.get().copies, starter);
  // Three copies are no one item.
  assert.equal(store.get().item, null);
});

test('with the add key the rectangle adds to the selection; an empty one clears it', () => {
  const { store, frame } = mounted();
  store.set({ on: true, selection: [ROW], copies: [row(4, [1, 1])] });
  frame(rect([{ id: TITLE }, row(5, [1, 2])], true));
  assert.deepEqual(store.get().selection, [ROW, TITLE]);
  assert.deepEqual(store.get().copies, [row(4, [1, 1]), row(5, [1, 2])]);
  frame(rect([], true));
  assert.deepEqual(store.get().selection, [ROW, TITLE]);
  frame(rect([]));
  assert.deepEqual(store.get().selection, []);
  assert.deepEqual(store.get().copies, []);
});

test('a rectangle that takes what is selected already changes nothing', () => {
  const { store, frame } = mounted();
  store.set({ on: true, selection: [ROW], copies: [row(4, [1, 1])] });
  let heard = 0;
  store.subscribe(() => {
    heard += 1;
  });
  frame(rect([row(4, [1, 1])]));
  frame(rect([row(4, [1, 1])], true));
  assert.equal(heard, 0);
  // Another message of the frame is not a rectangle.
  frame({ kitvas: 1, channel: 'c1', type: 'hovered', id: TITLE });
  assert.equal(heard, 0);
});
