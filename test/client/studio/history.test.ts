import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { EditStudioBody } from '../../../client/channel/edit-protocol.ts';
import type { Answer } from '../../../client/studio/edit/api.ts';
import type { Bridge } from '../../../client/studio/edit/bridge.ts';
import {
  createHistory,
  GROUP_MS,
  type HistoryIo,
  inverse,
  inverseAll,
} from '../../../client/studio/edit/history.ts';
import { createStore, type Gesture } from '../../../client/studio/edit/store.ts';
import {
  type EditOp,
  inverseAll as serverAll,
  inverse as serverInverse,
} from '../../../src/edit/index.ts';
import type { EditOutcome, EditRequest } from '../../../src/studio/api/edit-schemas.ts';

const id = 'sections/Pricing:section/Stack/Card.2';
const TSX = 'src/tsx/sections/Pricing.tsx';
const SCSS = 'src/scss/sections/pricing.scss';

type SetStyle = Extract<EditOp, { op: 'setStyle' }>;

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

const applied = (started = false): Answer<EditOutcome> => ({
  ok: true,
  status: 200,
  body: { outcome: 'applied', version: 2, started, etags: { [SCSS]: '"new"' }, merged: false },
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
  const undone = inverseAll(step?.ops ?? []);
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

const samples: EditOp[] = [
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
