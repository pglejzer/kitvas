// The chosen copies of the selection across the person's own edits (ADR 0065): they follow their
// elements after an applied edit, an undo and a redo, and leave with an element that is gone.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { CopyRef, EditStudioBody } from '../../../../../client/channel/edit-protocol.ts';
import type { Answer } from '../../../../../client/studio/edit/api.ts';
import type { Bridge } from '../../../../../client/studio/edit/bridge.ts';
import {
  copiesBack,
  createHistory,
  goneAfter,
  type HistoryIo,
} from '../../../../../client/studio/edit/history/history.ts';
import { createStore } from '../../../../../client/studio/edit/store.ts';
import type { EditOp } from '../../../../../src/edit/index.ts';
import type { EditOutcome, EditRequest } from '../../../../../src/studio/api/edit/edit-schemas.ts';

const CARD = 'sections/Pricing:section/Stack/Card';
const CARD2 = `${CARD}.2`;
const ROW = `${CARD}/ul/li`;
const TSX = 'src/tsx/sections/Pricing.tsx';

type Applied = Extract<EditOutcome, { outcome: 'applied' }>;

const applied = (extra: Partial<Omit<Applied, 'outcome'>> = {}): Answer<EditOutcome> => ({
  ok: true,
  status: 200,
  body: {
    outcome: 'applied',
    version: 2,
    started: false,
    etags: { [TSX]: '"new"' },
    merged: false,
    inverse: [],
    renames: {},
    created: [],
    dropped: [],
    ...extra,
  },
});

function setup(answers: Answer<EditOutcome>[]) {
  const store = createStore('demo');
  store.set({
    edit: { slug: 'demo', version: 1, session: null, format: 'scss', etags: {}, tokens: [] },
    etags: { [TSX]: '"old"' },
  });
  const requests: EditRequest[] = [];
  const io: HistoryIo = {
    post: async (_slug, request) => {
      requests.push(request);
      return answers.shift() ?? { ok: false, status: 0, code: null };
    },
    now: () => 1_000,
  };
  const stub = {} as unknown as HTMLElement;
  const bridge = {
    send: (_body: EditStudioBody) => undefined,
    flash: (_ids: readonly string[]) => undefined,
  } as unknown as Bridge;
  const history = createHistory({ slug: 'demo', main: stub, panel: stub, store, bridge }, io);
  return { store, history, requests };
}

const ROW_COPY: CopyRef = { id: ROW, item: 4, path: [1, 1] };
const CARD_COPY: CopyRef = { id: CARD, item: 1, path: [1] };
const SET_TEXT: EditOp = { op: 'setText', id: ROW, value: 'SSO', before: 'SAML' };
const MOVE_ITEM: EditOp = { op: 'moveItem', id: ROW, item: 1, to: 2, path: [1, 1] };
/** A server-made inverse: what the undo of a list or a structure step sends. */
const PATCH: EditOp = { op: 'patch', file: TSX, hunks: [{ find: 'a', replace: 'b' }] };

test('an id is gone when the request removed it or its name went to another element', () => {
  // Two elements that swap their ids are both still there.
  const swapped = goneAfter({ [CARD]: CARD2, [CARD2]: CARD }, []);
  assert.equal(swapped(CARD), false);
  assert.equal(swapped(CARD2), false);
  assert.equal(swapped(ROW), false);
  // The first card took the second one's id, and the second got none: it was removed.
  const taken = goneAfter({ [CARD]: CARD2 }, []);
  assert.equal(taken(CARD2), true);
  assert.equal(taken(CARD), false);
  // An element the answer created has the id now.
  assert.equal(goneAfter({}, [CARD2])(CARD2), true);
  const removed = goneAfter({}, [], new Set([CARD]));
  assert.equal(removed(CARD), true);
  assert.equal(removed(ROW), false);
});

test('after an undo the copies follow their elements; a patch drops a copy named by its path', () => {
  const flat: CopyRef = { id: CARD, item: 1 };
  // The client's own inverse writes no list.
  assert.deepEqual(copiesBack([ROW_COPY, flat], [SET_TEXT], {}, []), [ROW_COPY, flat]);
  // Text a patch put back may have moved the items of a list.
  assert.deepEqual(copiesBack([ROW_COPY, flat], [PATCH], {}, []), [flat]);
  const file: EditOp = { op: 'file', file: TSX, text: 'x', before: 'y' };
  assert.deepEqual(copiesBack([ROW_COPY], [file], {}, []), []);
  // A renamed element keeps its copy; one whose id went to a new element loses it.
  const renamed = copiesBack([flat], [SET_TEXT], { [CARD]: CARD2 }, []);
  assert.deepEqual(renamed, [{ id: CARD2, item: 1 }]);
  assert.deepEqual(copiesBack([flat], [SET_TEXT], {}, [CARD]), []);
});

test('an applied edit leaves the selection on its chosen copy', async () => {
  const { store, history } = setup([applied()]);
  store.set({ selection: [ROW], copies: [ROW_COPY] });
  const before = store.get().copies;
  await history.apply({ ops: [MOVE_ITEM], label: 'Move item' });
  assert.deepEqual(store.get().selection, [ROW]);
  // The same array: no panel hears a change of the copies.
  assert.equal(store.get().copies, before);
  assert.equal(store.get().item, 4);
});

test('a chosen copy follows its element to the id the edit gave it', async () => {
  const renames = { [CARD]: CARD2, [CARD2]: CARD };
  const { store, history } = setup([applied({ renames })]);
  store.set({ selection: [CARD], copies: [CARD_COPY] });
  const move: EditOp = { op: 'moveElement', id: CARD2, anchor: CARD, place: 'before' };
  await history.apply({ ops: [move], label: 'Move' });
  assert.deepEqual(store.get().selection, [CARD2]);
  assert.deepEqual(store.get().copies, [{ id: CARD2, item: 1, path: [1] }]);
});

test('an element the edit removed takes its copies out of the selection', async () => {
  const { store, history } = setup([applied()]);
  store.set({ selection: [CARD, ROW], copies: [CARD_COPY, ROW_COPY] });
  await history.apply({ ops: [{ op: 'removeElement', id: CARD }], label: 'Delete' });
  assert.deepEqual(store.get().selection, [ROW]);
  assert.deepEqual(store.get().copies, [ROW_COPY]);
});

test('what an edit created is selected as itself, with no copy', async () => {
  const { store, history } = setup([applied({ created: [CARD2] })]);
  store.set({ selection: [CARD], copies: [CARD_COPY] });
  const insert: EditOp = {
    op: 'insertElement',
    anchor: CARD,
    place: 'after',
    source: '<Card />',
  };
  await history.apply({ ops: [insert], label: 'Paste', selectCreated: true });
  assert.deepEqual(store.get().selection, [CARD2]);
  assert.deepEqual(store.get().copies, []);
  assert.equal(store.get().item, null);
});

test('an undo the client made keeps the chosen copy', async () => {
  const { store, history, requests } = setup([applied(), applied()]);
  store.set({ selection: [ROW], copies: [ROW_COPY] });
  const before = store.get().copies;
  await history.apply({ ops: [SET_TEXT], label: 'Text' });
  await history.undo();
  assert.equal(requests.length, 2);
  assert.equal(store.get().copies, before);
  assert.equal(store.get().item, 4);
});

test('an undo by a patch keeps the element selected as itself', async () => {
  const { store, history, requests } = setup([applied({ inverse: [PATCH] }), applied()]);
  store.set({ selection: [ROW], copies: [ROW_COPY] });
  await history.apply({ ops: [MOVE_ITEM], label: 'Move item' });
  await history.undo();
  assert.deepEqual(requests[1]?.ops, [PATCH]);
  assert.deepEqual(store.get().selection, [ROW]);
  assert.deepEqual(store.get().copies, []);
  assert.equal(store.get().item, null);
});
