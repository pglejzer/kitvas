import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { EditStudioBody } from '../../../../../client/channel/edit-protocol.ts';
import type { Answer } from '../../../../../client/studio/edit/api.ts';
import type { Bridge } from '../../../../../client/studio/edit/bridge.ts';
import {
  clientInverse,
  createHistory,
  GROUP_MS,
  type HistoryIo,
  inverse,
  inverseAll,
} from '../../../../../client/studio/edit/history/history.ts';
import { createStore, elementOf, type Gesture } from '../../../../../client/studio/edit/store.ts';
import {
  type EditOp,
  type SimpleOp,
  inverseAll as serverAll,
  inverse as serverInverse,
} from '../../../../../src/edit/index.ts';
import type { EditOutcome, EditRequest } from '../../../../../src/studio/api/edit/edit-schemas.ts';

const id = 'sections/Pricing:section/Stack/Card.2';
const CARD = 'sections/Pricing:section/Stack/Card';
const TSX = 'src/tsx/sections/Pricing.tsx';
const SCSS = 'src/scss/sections/pricing.scss';

type SetStyle = Extract<EditOp, { op: 'setStyle' }>;
type Applied = Extract<EditOutcome, { outcome: 'applied' }>;

const gap = (value: string, before: string | null, newRule = false): SetStyle => ({
  op: 'setStyle',
  id,
  className: 'card',
  property: 'gap',
  value: { raw: value },
  before: before === null ? null : { raw: before },
  newRule,
});
const gesture = (op: EditOp, label = 'Set gap'): Gesture => ({ ops: [op], label });
const variant = (element: string): SimpleOp => ({
  op: 'setProp',
  id: element,
  name: 'variant',
  value: { kind: 'string', value: 'outline' },
  before: { kind: 'string', value: 'solid' },
  after: null,
});
/** A server-made inverse: what undo of a structural step sends. */
const hunk = (find: string, replace: string): EditOp => ({
  op: 'patch',
  file: TSX,
  hunks: [{ find, replace }],
});
const move: EditOp = { op: 'moveElement', id, anchor: CARD, place: 'before' };
/** What moving the second card before the first does to the two ids. */
const swap = { [CARD]: id, [id]: CARD };

const applied = (
  started = false,
  extra: Partial<Omit<Applied, 'outcome'>> = {},
): Answer<EditOutcome> => ({
  ok: true,
  status: 200,
  body: {
    outcome: 'applied',
    version: 2,
    started,
    etags: { [SCSS]: '"new"' },
    merged: false,
    inverse: [],
    renames: {},
    created: [],
    dropped: [],
    ...extra,
  },
});
const conflictAnswer = (reason: 'changed' | 'gone' = 'changed'): Answer<EditOutcome> => ({
  ok: true,
  status: 200,
  body: {
    outcome: 'conflict',
    version: 2,
    index: 0,
    reason,
    file: TSX,
    text: 'x',
    etag: '"theirs"',
  },
});

function setup(answers: Answer<EditOutcome>[]) {
  const store = createStore('demo');
  store.set({
    edit: { slug: 'demo', version: 1, session: null, format: 'scss', etags: {}, tokens: [] },
    etags: { [SCSS]: '"old"', [TSX]: '"old-tsx"' },
  });
  const requests: EditRequest[] = [];
  const sent: EditStudioBody[] = [];
  let clock = 1_000;
  const io: HistoryIo = {
    post: async (_slug, request) => {
      requests.push(request);
      const next = answers.shift();
      return next ?? { ok: false, status: 0, code: null };
    },
    now: () => clock,
  };
  const stub = {} as unknown as HTMLElement;
  const bridge = { send: (body: EditStudioBody) => sent.push(body) } as unknown as Bridge;
  const history = createHistory({ slug: 'demo', main: stub, panel: stub, store, bridge }, io);
  return { store, history, requests, sent, tick: (ms: number) => (clock += ms) };
}

test('apply, undo and redo send the op, its inverse, and the op again', async () => {
  const { store, history, requests } = setup([applied(), applied(), applied()]);
  const op = gap('13px', '8px');
  await history.apply(gesture(op));
  assert.equal(store.get().undo.length, 1);
  await history.undo();
  await history.redo();
  assert.deepEqual(
    requests.map((request) => request.ops),
    [[op], [serverInverse(op)], [op]],
  );
  assert.equal(store.get().undo.length, 1);
  assert.equal(store.get().redo.length, 0);
  assert.equal(store.get().etags[SCSS], '"new"');
});

test('undo of a structural gesture sends its undoOps, and redo the inverse the undo answered with', async () => {
  const { store, history, requests } = setup([
    applied(false, { inverse: [hunk('b', 'a')], renames: swap }),
    applied(false, { inverse: [hunk('a', 'b')] }),
    applied(false, { inverse: [hunk('b', 'a2')] }),
    applied(),
  ]);
  await history.apply({ ops: [move], label: 'Move' });
  assert.deepEqual(store.get().undo[0]?.undoOps, [hunk('b', 'a')]);
  await history.undo();
  assert.deepEqual(store.get().redo[0]?.ops, [hunk('b', 'a')]);
  assert.deepEqual(store.get().redo[0]?.undoOps, [hunk('a', 'b')]);
  await history.redo();
  await history.undo();
  assert.deepEqual(
    requests.map((request) => request.ops),
    [[move], [hunk('b', 'a')], [hunk('a', 'b')], [hunk('b', 'a2')]],
  );
  assert.equal(store.get().undo.length, 0);
  assert.equal(store.get().redo.length, 1);
});

test('an answer moves the selection, hidden elements and the change list, never the steps', async () => {
  const prop = variant(id);
  const { store, history, requests } = setup([
    applied(),
    applied(false, { inverse: [hunk('b', 'a')], renames: swap }),
    // The undo's own answer cannot tell where the moved card went: the step's renames can.
    applied(),
    applied(),
  ]);
  await history.apply(gesture(prop, 'Set variant'));
  store.set({ selection: [id], hidden: [CARD], hovered: id, menu: { id, x: 1, y: 2 } });
  await history.apply({ ops: [move], label: 'Move' });
  assert.deepEqual(store.get().selection, [CARD]);
  assert.deepEqual(store.get().hidden, [id]);
  assert.equal(store.get().hovered, CARD);
  assert.equal(store.get().menu?.id, CARD);
  // Both lines are about the card that moved, which is `Card` now.
  assert.deepEqual(
    store.get().changes.map((change) => change.id),
    [CARD, CARD],
  );
  assert.deepEqual(store.get().undo[0]?.ops, [prop]);
  await history.undo();
  assert.deepEqual(store.get().selection, [id]);
  assert.deepEqual(store.get().hidden, [CARD]);
  await history.undo();
  assert.deepEqual(requests[3]?.ops, [inverse(prop)]);
});

test('a step under a removal keeps the removed element id, so its undo finds it again', async () => {
  const prop = variant(CARD);
  const { store, history, requests } = setup([
    applied(),
    // The second card takes the removed one's id.
    applied(false, { inverse: [hunk('x', 'y')], renames: { [id]: CARD } }),
    applied(false, { renames: { [CARD]: id }, created: [CARD] }),
    applied(),
  ]);
  await history.apply(gesture(prop, 'Set variant'));
  store.set({ selection: [CARD] });
  await history.apply({ ops: [{ op: 'removeElement', id: CARD }], label: 'Delete' });
  // `Card` names the other card now: the removed one leaves the selection.
  assert.deepEqual(store.get().selection, []);
  await history.undo();
  await history.undo();
  assert.deepEqual(requests[3]?.ops, [inverse(prop)]);
});

test('a deleted element that no other one replaces leaves the selection too', async () => {
  // The last of its siblings: nothing is renamed, so only the delete itself says it is gone.
  const { store, history } = setup([applied(false, { inverse: [hunk('x', 'y')] })]);
  store.set({ selection: [CARD, id] });
  await history.apply({ ops: [{ op: 'removeElement', id: CARD }], label: 'Delete' });
  assert.deepEqual(store.get().selection, [id]);
});

test('a gesture that asks for it selects what its answer created', async () => {
  const { store, history } = setup([
    applied(false, { inverse: [hunk('x', 'y')], created: [CARD], renames: { [CARD]: id } }),
    applied(false, { inverse: [hunk('y', 'z')], created: [CARD] }),
  ]);
  store.set({ selection: [CARD] });
  const insert: Gesture & { selectCreated?: boolean } = {
    ops: [{ op: 'insertElement', anchor: CARD, place: 'before', source: '<Card />' }],
    label: 'Insert',
    selectCreated: true,
  };
  await history.apply(insert);
  assert.deepEqual(store.get().selection, [CARD]);
  // Without the wish, the selection only follows the renames.
  store.set({ selection: [id] });
  await history.apply({ ops: insert.ops, label: 'Insert' });
  assert.deepEqual(store.get().selection, [id]);
});

test('a step whose inverse nobody knows is dropped by undo, so older steps stay reachable', async () => {
  const { store, history, requests } = setup([applied(), applied(), applied()]);
  await history.apply(gesture(gap('13px', '8px')));
  // A structural answer without an inverse: undo cannot send anything for it.
  await history.apply({ ops: [move], label: 'Move' });
  await history.undo();
  assert.equal(requests.length, 2);
  assert.equal(store.get().undo.length, 1);
  await history.undo();
  assert.deepEqual(requests[2]?.ops, [serverInverse(gap('13px', '8px'))]);
});

test('a new edit clears the redo stack', async () => {
  const { store, history } = setup([applied(), applied(), applied()]);
  await history.apply(gesture(gap('13px', '8px')));
  await history.undo();
  assert.equal(store.get().redo.length, 1);
  await history.apply(gesture(gap('20px', '8px')));
  assert.equal(store.get().redo.length, 0);
});

test('the first applied edit records the version it started', async () => {
  const { store, history } = setup([applied(true)]);
  await history.apply(gesture(gap('13px', '8px')));
  assert.equal(store.get().edit?.version, 2);
  assert.equal(store.get().edit?.session?.version, 2);
});

test('the change list marks a raw style value as off-kit', async () => {
  const { store, history } = setup([applied()]);
  await history.apply(gesture(gap('13px', '8px')));
  const [entry] = store.get().changes;
  assert.equal(entry?.by, 'person');
  assert.equal(entry?.offKit, true);
  assert.equal(entry?.id, id);
});

test('edits of one property within 800 ms are one undo step', async () => {
  const { store, history, requests, tick } = setup([applied(), applied(), applied()]);
  await history.apply(gesture(gap('9px', '8px')));
  tick(GROUP_MS - 1);
  await history.apply(gesture(gap('10px', '9px')));
  tick(100);
  await history.apply(gesture(gap('11px', '10px')));
  assert.equal(store.get().undo.length, 1);
  assert.equal(store.get().changes.length, 1);
  const [step] = store.get().undo;
  assert.deepEqual(step?.ops, [gap('11px', '8px')]);
  await history.undo();
  assert.deepEqual(requests[3]?.ops, [gap('8px', '11px')]);
});

test('a grouped stepper drag is undone by the client inverse, not the first answer inverse', async () => {
  const { store, history, requests, tick } = setup([
    applied(false, { inverse: [gap('8px', '9px')] }),
    applied(false, { inverse: [gap('9px', '10px')] }),
    applied(),
  ]);
  await history.apply(gesture(gap('9px', '8px')));
  tick(100);
  await history.apply(gesture(gap('10px', '9px')));
  assert.equal(store.get().undo.length, 1);
  assert.deepEqual(store.get().undo[0]?.undoOps, [gap('8px', '10px')]);
  await history.undo();
  assert.deepEqual(requests[2]?.ops, [gap('8px', '10px')]);
});

test('a structural step is never grouped with a stepper drag', async () => {
  const { store, history, tick } = setup([
    applied(),
    applied(false, { inverse: [hunk('a', 'b')] }),
  ]);
  await history.apply({ ops: [move, gap('9px', '8px')], label: 'Move' });
  tick(100);
  await history.apply(gesture(gap('10px', '9px')));
  assert.equal(store.get().undo.length, 2);
});

test('a pause longer than 800 ms starts a new undo step', async () => {
  const { store, history, tick } = setup([applied(), applied()]);
  await history.apply(gesture(gap('9px', '8px')));
  tick(GROUP_MS + 1);
  await history.apply(gesture(gap('10px', '9px')));
  assert.equal(store.get().undo.length, 2);
});

test('another property is never grouped', async () => {
  const { store, history } = setup([applied(), applied()]);
  await history.apply(gesture(gap('9px', '8px')));
  const padding: EditOp = { ...gap('4px', '2px'), property: 'padding' };
  await history.apply(gesture(padding));
  assert.equal(store.get().undo.length, 2);
});

test('a step that created the rule keeps newRule when grouped, so undo drops the rule', async () => {
  const { store, history } = setup([applied(), applied()]);
  await history.apply(gesture(gap('9px', null, true)));
  await history.apply(gesture(gap('10px', '9px')));
  const [step] = store.get().undo;
  assert.deepEqual(step?.ops, [gap('10px', null, true)]);
  const undone = clientInverse(step?.ops ?? []) ?? [];
  assert.equal(undone[0]?.op === 'removeStyle' && undone[0].dropRule, true);
});

test('a conflict on undo offers the choice and keeps both stacks', async () => {
  const { store, history, sent } = setup([applied(), conflictAnswer()]);
  await history.apply(gesture(gap('13px', '8px')));
  await history.undo();
  assert.equal(store.get().conflict?.outcome.reason, 'changed');
  assert.equal(store.get().undo.length, 1);
  assert.equal(store.get().redo.length, 0);
  assert.equal(sent.at(-1)?.type, 'unpreview');
});

test('keep mine sends the same ops with force and the conflict etag', async () => {
  const { store, history, requests } = setup([applied(), conflictAnswer(), applied()]);
  const op = gap('13px', '8px');
  await history.apply(gesture(op));
  await history.undo();
  await history.keepMine();
  const forced = requests[2];
  assert.equal(forced?.force, true);
  assert.deepEqual(forced?.ops, [serverInverse(op)]);
  assert.equal(forced?.etags[TSX], '"theirs"');
  assert.equal(store.get().conflict, null);
  assert.equal(store.get().undo.length, 0);
  assert.equal(store.get().redo.length, 1);
});

test('keep theirs on an undo drops the gesture and takes their etag', async () => {
  const { store, history, requests } = setup([applied(), conflictAnswer()]);
  await history.apply(gesture(gap('13px', '8px')));
  await history.undo();
  history.keepTheirs();
  assert.equal(store.get().conflict, null);
  assert.equal(store.get().undo.length, 0);
  assert.equal(store.get().redo.length, 0);
  assert.equal(store.get().etags[TSX], '"theirs"');
  assert.equal(requests.length, 2);
});

test('keep theirs on the undo of a move gives the steps under it the move renames', async () => {
  const { store, history } = setup([
    applied(),
    applied(false, { inverse: [hunk('b', 'a')], renames: swap }),
    conflictAnswer(),
  ]);
  await history.apply(gesture(variant(id), 'Set variant'));
  await history.apply({ ops: [move], label: 'Move' });
  await history.undo();
  history.keepTheirs();
  assert.equal(store.get().undo.length, 1);
  const [first] = store.get().undo[0]?.ops ?? [];
  assert.equal(first ? elementOf(first) : null, CARD);
});

test('keep theirs on a fresh edit leaves the stacks as they were', async () => {
  const { store, history } = setup([conflictAnswer('gone')]);
  await history.apply(gesture(gap('13px', '8px')));
  history.keepTheirs();
  assert.equal(store.get().undo.length, 0);
  assert.equal(store.get().etags[TSX], '"theirs"');
});

test('a refused edit shows its reason and takes the preview back', async () => {
  const { store, history, sent } = setup([
    {
      ok: true,
      status: 200,
      body: { outcome: 'refused', version: 1, refusals: [{ index: 0, reason: 'computed' }] },
    },
  ]);
  await history.apply(gesture(gap('13px', '8px')));
  assert.equal(store.get().refused?.reason, 'computed');
  assert.equal(store.get().undo.length, 0);
  assert.equal(sent.at(-1)?.type, 'unpreview');
});

test('a lost request takes the preview back and keeps the stacks', async () => {
  const { store, history, sent } = setup([applied()]);
  await history.apply(gesture(gap('13px', '8px')));
  const answer = await history.apply(gesture({ ...gap('4px', '2px'), property: 'padding' }));
  assert.equal(answer, null);
  assert.equal(store.get().undo.length, 1);
  assert.equal(store.get().busy, false);
  assert.equal(sent.at(-1)?.type, 'unpreview');
});

test('requests wait for each other', async () => {
  const { history, requests } = setup([applied(), applied()]);
  const first = history.apply(gesture(gap('9px', '8px')));
  const second = history.apply(gesture({ ...gap('4px', '2px'), property: 'padding' }));
  await Promise.all([first, second]);
  assert.equal(requests.length, 2);
  assert.equal(requests[0]?.ops[0]?.op, 'setStyle');
});

const samples: SimpleOp[] = [
  {
    op: 'setProp',
    id,
    name: 'variant',
    value: { kind: 'string', value: 'outline' },
    before: { kind: 'string', value: 'solid' },
    after: null,
  },
  {
    op: 'setProp',
    id,
    name: 'size',
    value: { kind: 'string', value: 'sm' },
    before: null,
    after: 'variant',
  },
  {
    op: 'removeProp',
    id,
    name: 'disabled',
    before: { kind: 'boolean', value: true },
    after: 'size',
  },
  { op: 'setText', id, value: 'Start free', before: "Don't wait" },
  {
    op: 'setStyle',
    id,
    className: 'card',
    property: 'gap',
    value: { token: '--kit-space-md' },
    before: { raw: '13px' },
    newRule: false,
  },
  {
    op: 'setStyle',
    id,
    className: 'card',
    property: 'padding',
    value: { raw: '13px' },
    before: null,
    newRule: true,
  },
  {
    op: 'removeStyle',
    id,
    className: 'card',
    property: 'color',
    before: { token: '--kit-color-ink' },
    dropRule: false,
  },
  { op: 'addClass', id, className: 'pricing-card' },
  { op: 'removeClass', id, className: 'pricing-card' },
];

test('the client inverse equals the server inverse on every sample', () => {
  for (const op of samples) assert.deepEqual(inverse(op), serverInverse(op));
  assert.deepEqual(inverseAll(samples), serverAll(samples));
});

test('the client makes no inverse for a gesture with a structural op', () => {
  assert.deepEqual(clientInverse(samples), serverAll(samples));
  assert.equal(clientInverse([samples[0] ?? move, move]), null);
});
