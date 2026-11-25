import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import type { EditorContext } from '../../../../../client/studio/edit/context.ts';
import { createStore, type Gesture, type Store } from '../../../../../client/studio/edit/store.ts';
import {
  ACTIONS,
  type ActionId,
  actionsFor,
  forgetStyleClip,
  runAction,
} from '../../../../../client/studio/edit/structure/actions.ts';
import {
  copyLocation,
  defaultClipboardIo,
  locationLines,
} from '../../../../../client/studio/edit/structure/clipboard.ts';
import { type EditOp, STYLE_PROPERTIES } from '../../../../../src/edit/index.ts';
import type { Inspect } from '../../../../../src/studio/api/edit/edit-schemas.ts';
import type { StructureEntry } from '../../../../../src/studio/api/edit/structure-schemas.ts';

const FILE = 'src/tsx/sections/Pricing.tsx';
const ROOT = 'sections/Pricing:section';
const HEAD = `${ROOT}/Heading`;
const CARD = `${ROOT}/Card`;
const CARD2 = `${ROOT}/Card.2`;
const ITEM = `${ROOT}/Text`;
const INNER = `${CARD}/Text`;
const HASH = (n: number): string => n.toString(16).padStart(16, '0');
const ETAG = `"${'a'.repeat(27)}"`;

function entry(id: string, own: Partial<StructureEntry> = {}): StructureEntry {
  const tag = id.slice(id.lastIndexOf('/') + 1).replace(/\.\d+$/, '');
  return {
    id,
    file: FILE,
    line: 10,
    column: 5,
    tag: id === ROOT ? 'section' : tag,
    parent: null,
    hash: HASH(1),
    text: null,
    props: [],
    component: null,
    movable: null,
    accepts: true,
    mixed: false,
    interactive: false,
    root: null,
    ...own,
  };
}

/** A section root with a heading, two cards (the first holds a text) and a mapped item. */
const ELEMENTS: StructureEntry[] = [
  entry(ROOT, { root: 'section', movable: 'section-root', hash: HASH(10) }),
  entry(HEAD, { parent: ROOT, hash: HASH(11) }),
  entry(CARD, { parent: ROOT, hash: HASH(12) }),
  entry(INNER, { parent: CARD, hash: HASH(13) }),
  entry(CARD2, { parent: ROOT, hash: HASH(14) }),
  entry(ITEM, { parent: ROOT, hash: HASH(15), movable: 'in-expression' }),
];

type Fixture = { ctx: EditorContext; store: Store; gestures: Gesture[]; sent: unknown[] };

function fixture(select: string[], more: Partial<Parameters<Store['set']>[0]> = {}): Fixture {
  const store = createStore('demo');
  store.set({
    on: true,
    selection: select,
    structure: { version: 2, folder: '/d/shop/v2', etags: {}, elements: ELEMENTS, sections: [] },
    ...more,
  });
  const gestures: Gesture[] = [];
  const sent: unknown[] = [];
  const ctx = {
    slug: 'demo',
    store,
    history: {
      apply: async (gesture: Gesture) => {
        gestures.push(gesture);
        return null;
      },
    },
    bridge: { send: (body: unknown) => sent.push(body) },
  } as unknown as EditorContext;
  return { ctx, store, gestures, sent };
}

const real = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = real;
  forgetStyleClip();
});

/** Answers the editor's GETs from a table keyed by the request path. */
function stubFetch(routes: Record<string, unknown>): string[] {
  const asked: string[] = [];
  globalThis.fetch = (async (input: unknown) => {
    const url = String(input);
    asked.push(url);
    const body = routes[decodeURIComponent(url)];
    return body === undefined ? Response.json({}, { status: 404 }) : Response.json(body);
  }) as typeof fetch;
  return asked;
}

const subtree = (id: string, source: string): unknown => ({
  id,
  file: FILE,
  hash: HASH(1),
  source,
});
const stateOf = (f: Fixture, id: ActionId) => actionsFor(f.store.get()).find((a) => a.id === id);

test('delete sends one removeElement per selected element with its hash, in document order', async () => {
  const f = fixture([CARD2, HEAD]);
  await runAction(f.ctx, 'delete');
  assert.equal(f.gestures.length, 1);
  assert.deepEqual(f.gestures[0]?.ops, [
    { op: 'removeElement', id: HEAD, hash: HASH(11) },
    { op: 'removeElement', id: CARD2, hash: HASH(14) },
  ]);
});

test('delete leaves out an element whose parent is selected too', async () => {
  const f = fixture([INNER, CARD]);
  await runAction(f.ctx, 'delete');
  assert.deepEqual(f.gestures[0]?.ops, [{ op: 'removeElement', id: CARD, hash: HASH(12) }]);
});

test('delete is off with the movable refusal, and runAction then sends nothing', async () => {
  const f = fixture([ROOT]);
  assert.deepEqual(stateOf(f, 'delete'), { id: 'delete', enabled: false, reason: 'section-root' });
  await runAction(f.ctx, 'delete');
  assert.deepEqual(f.gestures, []);
  const mapped = fixture([ITEM]);
  assert.equal(stateOf(mapped, 'duplicate')?.reason, 'in-expression');
  assert.equal(stateOf(mapped, 'cut')?.reason, 'in-expression');
  assert.equal(stateOf(mapped, 'move-up')?.reason, 'in-expression');
});

test('nothing selected turns the element actions off but not show all', () => {
  const f = fixture([]);
  const states = actionsFor(f.store.get());
  assert.deepEqual(states.length, ACTIONS.length);
  assert.equal(stateOf(f, 'delete')?.reason, 'no-selection');
  assert.equal(stateOf(f, 'wrap-stack')?.enabled, false);
  assert.equal(stateOf(f, 'show-all')?.enabled, true);
});

test('copy location is on with one or more elements selected and off with none', () => {
  assert.deepEqual(stateOf(fixture([CARD]), 'copy-location'), {
    id: 'copy-location',
    enabled: true,
    reason: null,
  });
  assert.equal(stateOf(fixture([HEAD, CARD2]), 'copy-location')?.enabled, true);
  assert.equal(stateOf(fixture([]), 'copy-location')?.reason, 'no-selection');
});

test('locationLines gives folder/file:line:column in page order, one line per element', () => {
  const at = (id: string, line: number, column: number) => ({ id, file: FILE, line, column });
  const elements = [at(HEAD, 3, 7), at(CARD, 8, 5), at(CARD2, 20, 5)];
  assert.equal(
    locationLines('/d/shop/v2', elements, [CARD2, HEAD]),
    `/d/shop/v2/${FILE}:3:7\n/d/shop/v2/${FILE}:20:5`,
  );
  assert.equal(locationLines('/d/shop/v2', elements, ['unknown']), '');
});

test('copyLocation writes the lines to the clipboard, and says false when it is refused', async () => {
  const f = fixture([CARD, HEAD]);
  const written: string[] = [];
  const io = {
    ...defaultClipboardIo,
    writeText: async (value: string) => {
      written.push(value);
    },
  };
  assert.equal(await copyLocation(f.ctx, [CARD, HEAD], io), true);
  assert.deepEqual(written, [`/d/shop/v2/${FILE}:10:5\n/d/shop/v2/${FILE}:10:5`]);
  const refused = { ...io, writeText: async () => Promise.reject(new Error('denied')) };
  assert.equal(await copyLocation(f.ctx, [CARD], refused), false);
  assert.equal(await copyLocation(f.ctx, [], io), false);
});

test('duplicate inserts each element source after it, from the file it was read in', async () => {
  const f = fixture([CARD]);
  stubFetch({ [`/api/v1/drafts/demo/subtree?id=${CARD}`]: subtree(CARD, '<Card>x</Card>') });
  await runAction(f.ctx, 'duplicate');
  assert.deepEqual(f.gestures[0]?.ops, [
    { op: 'insertElement', anchor: CARD, place: 'after', source: '<Card>x</Card>', from: FILE },
  ]);
});

test('duplicate sends nothing when a source cannot be read', async () => {
  const f = fixture([HEAD, CARD]);
  stubFetch({ [`/api/v1/drafts/demo/subtree?id=${HEAD}`]: subtree(HEAD, '<Heading />') });
  await runAction(f.ctx, 'duplicate');
  assert.deepEqual(f.gestures, []);
});

test('cut copies first and then removes; the clipboard is the editor clip', async () => {
  const f = fixture([CARD]);
  stubFetch({ [`/api/v1/drafts/demo/subtree?id=${CARD}`]: subtree(CARD, '<Card>x</Card>') });
  await runAction(f.ctx, 'cut');
  assert.deepEqual(f.store.get().clipboard?.items, [{ source: '<Card>x</Card>', from: FILE }]);
  assert.deepEqual(f.gestures[0]?.ops, [{ op: 'removeElement', id: CARD, hash: HASH(12) }]);
});

test('copy only keeps the clip and sends no edit', async () => {
  const f = fixture([CARD]);
  stubFetch({ [`/api/v1/drafts/demo/subtree?id=${CARD}`]: subtree(CARD, '<Card>x</Card>') });
  await runAction(f.ctx, 'copy');
  assert.equal(f.store.get().clipboard?.items.length, 1);
  assert.deepEqual(f.gestures, []);
});

test('paste is off without a clip, and puts clip items after the selection in order', async () => {
  const empty = fixture([HEAD]);
  assert.equal(stateOf(empty, 'paste')?.enabled, false);
  assert.equal(stateOf(empty, 'paste')?.reason, 'no-clip');
  const clipboard = {
    items: [
      { source: '<A />', from: FILE },
      { source: '<B />', from: '' },
    ],
    text: '<A />\n<B />',
    at: 1,
  };
  const f = fixture([HEAD], { clipboard });
  assert.equal(stateOf(f, 'paste')?.enabled, true);
  await runAction(f.ctx, 'paste');
  // Both land right after the heading, so the last one is inserted first.
  assert.deepEqual(f.gestures[0]?.ops, [
    { op: 'insertElement', anchor: HEAD, place: 'after', source: '<B />' },
    { op: 'insertElement', anchor: HEAD, place: 'after', source: '<A />', from: FILE },
  ]);
});

test('paste with nothing selected goes last inside the first section root', async () => {
  const clipboard = { items: [{ source: '<A />', from: FILE }], text: '<A />', at: 1 };
  const f = fixture([], { clipboard });
  await runAction(f.ctx, 'paste');
  assert.deepEqual(f.gestures[0]?.ops, [
    { op: 'insertElement', anchor: ROOT, place: 'last', source: '<A />', from: FILE },
  ]);
});

test('move-up moves the element before its previous sibling, move-down after the next', async () => {
  const f = fixture([CARD]);
  await runAction(f.ctx, 'move-up');
  assert.deepEqual(f.gestures[0]?.ops, [
    { op: 'moveElement', id: CARD, anchor: HEAD, place: 'before', hash: HASH(12) },
  ]);
  await runAction(f.ctx, 'move-down');
  assert.deepEqual(f.gestures[1]?.ops, [
    { op: 'moveElement', id: CARD, anchor: CARD2, place: 'after', hash: HASH(12) },
  ]);
});

test('move-up on the first child and move-down on the last sibling are off and do nothing', async () => {
  const first = fixture([HEAD]);
  assert.equal(stateOf(first, 'move-up')?.reason, 'at-edge');
  assert.equal(stateOf(fixture([INNER]), 'move-down')?.reason, 'at-edge');
  await runAction(first.ctx, 'move-up');
  assert.deepEqual(first.gestures, []);
  const last = fixture([INNER]);
  await runAction(last.ctx, 'move-down');
  assert.deepEqual(last.gestures, []);
});

test('moving a block of consecutive siblings keeps their order', async () => {
  const up = fixture([CARD, CARD2]);
  await runAction(up.ctx, 'move-up');
  assert.deepEqual(
    up.gestures[0]?.ops.map((op) => (op.op === 'moveElement' ? [op.id, op.anchor] : [])),
    [
      [CARD, HEAD],
      [CARD2, HEAD],
    ],
  );
  const down = fixture([HEAD, CARD]);
  await runAction(down.ctx, 'move-down');
  assert.deepEqual(
    down.gestures[0]?.ops.map((op) => (op.op === 'moveElement' ? [op.id, op.anchor] : [])),
    [
      [CARD, CARD2],
      [HEAD, CARD2],
    ],
  );
});

test('a move of elements that are not consecutive siblings is off with not-siblings', () => {
  const f = fixture([HEAD, CARD2]);
  assert.equal(stateOf(f, 'move-up')?.reason, 'not-siblings');
  assert.equal(stateOf(f, 'wrap-stack')?.reason, 'not-siblings');
  assert.equal(stateOf(fixture([HEAD, INNER]), 'wrap-row')?.reason, 'not-siblings');
});

test('each wrap action writes its opening tag; consecutive siblings wrap together', async () => {
  const f = fixture([CARD, CARD2]);
  const opens = new Map<ActionId, string>([
    ['wrap-stack', '<Stack>'],
    ['wrap-row', '<Stack direction="row">'],
    ['wrap-grid', '<Grid>'],
    ['wrap-card', '<Card>'],
  ]);
  for (const id of opens.keys()) await runAction(f.ctx, id);
  assert.deepEqual(
    f.gestures.map((gesture) => gesture.ops),
    [...opens.values()].map((open) => [{ op: 'wrapElements', first: CARD, last: CARD2, open }]),
  );
});

test('wrapping one element carries its hash', async () => {
  const f = fixture([HEAD]);
  await runAction(f.ctx, 'wrap-stack');
  assert.deepEqual(f.gestures[0]?.ops, [
    { op: 'wrapElements', first: HEAD, last: HEAD, open: '<Stack>', hash: HASH(11) },
  ]);
});

test('unwrap needs one element that has element children', async () => {
  const f = fixture([CARD]);
  await runAction(f.ctx, 'unwrap');
  assert.deepEqual(f.gestures[0]?.ops, [{ op: 'unwrapElement', id: CARD, hash: HASH(12) }]);
  assert.equal(stateOf(fixture([HEAD]), 'unwrap')?.reason, 'no-element-children');
  assert.equal(stateOf(fixture([CARD, HEAD]), 'unwrap')?.reason, 'one-only');
});

test('replace sends replaceTag with the chosen tag, and nothing without one', async () => {
  const f = fixture([HEAD]);
  await runAction(f.ctx, 'replace');
  assert.equal(f.gestures.length, 0);
  await runAction(f.ctx, 'replace', { tag: 'Badge' });
  assert.deepEqual(f.gestures[0]?.ops, [
    { op: 'replaceTag', id: HEAD, tag: 'Badge', hash: HASH(11) },
  ]);
});

test('reset sends resetElement for one element', async () => {
  const f = fixture([CARD]);
  await runAction(f.ctx, 'reset');
  assert.deepEqual(f.gestures[0]?.ops, [{ op: 'resetElement', id: CARD, hash: HASH(12) }]);
  assert.equal(stateOf(fixture([CARD, HEAD]), 'reset')?.reason, 'one-only');
});

test('select-similar selects every element with the same tag', async () => {
  const f = fixture([CARD]);
  await runAction(f.ctx, 'select-similar');
  assert.deepEqual(f.store.get().selection, [CARD, CARD2]);
  assert.deepEqual(f.gestures, []);
});

test('hide keeps the hidden ids in the store and tells the frame; show-all clears them', async () => {
  const f = fixture([HEAD], { hidden: [CARD] });
  await runAction(f.ctx, 'hide');
  assert.deepEqual(f.store.get().hidden, [CARD, HEAD]);
  await runAction(f.ctx, 'show-all');
  assert.deepEqual(f.store.get().hidden, []);
  assert.deepEqual(f.sent, [
    { type: 'hide', ids: [CARD, HEAD] },
    { type: 'hide', ids: [] },
  ]);
});

test('lock is offered while a selected element is free, unlock once all are locked', async () => {
  const f = fixture([HEAD], { locked: [CARD] });
  assert.equal(stateOf(f, 'lock')?.enabled, true);
  assert.equal(stateOf(f, 'unlock')?.enabled, false);
  await runAction(f.ctx, 'lock');
  assert.deepEqual(f.store.get().locked, [CARD, HEAD]);
  assert.equal(stateOf(f, 'lock')?.enabled, false);
  assert.equal(stateOf(f, 'unlock')?.enabled, true);
  await runAction(f.ctx, 'unlock');
  assert.deepEqual(f.store.get().locked, [CARD]);
  assert.deepEqual(f.sent, [
    { type: 'lock', ids: [CARD, HEAD] },
    { type: 'lock', ids: [CARD] },
  ]);
});

function inspected(id: string, props: Inspect['props']): Inspect {
  const styles = Object.fromEntries(
    STYLE_PROPERTIES.map((property) => [property, { kind: 'kit' }]),
  ) as Inspect['styles'];
  return {
    id,
    version: 2,
    hash: HASH(1),
    movable: null,
    file: FILE,
    etag: ETAG,
    tag: 'Stack',
    component: {
      name: 'Stack',
      takesClassName: true,
      props: [{ name: 'gap', type: 'enum', values: ['none', 'sm', 'md', 'lg'] }],
    },
    props,
    spread: false,
    text: null,
    textRefusal: null,
    className: null,
    styleClass: { className: 'plans', exists: false },
    scss: {
      file: 'src/scss/sections/pricing.scss',
      etag: ETAG,
      rule: false,
      declarations: [],
      nested: [],
    },
    styles: { ...styles, gap: { kind: 'prop', prop: 'gap' } },
  };
}

const gapProp = (value: string): Inspect['props'] => [
  { name: 'gap', kind: 'literal', value: { kind: 'string', value } },
];

test('copy style then paste style writes the kept prop on each selected element', async () => {
  const f = fixture([CARD], { inspected: inspected(CARD, gapProp('md')) });
  assert.equal(stateOf(f, 'paste-style')?.enabled, false);
  await runAction(f.ctx, 'copy-style');
  f.store.set({ selection: [HEAD, CARD2], inspected: null });
  assert.equal(stateOf(f, 'paste-style')?.enabled, true);
  stubFetch({
    [`/api/v1/drafts/demo/inspect?id=${HEAD}`]: inspected(HEAD, gapProp('sm')),
    [`/api/v1/drafts/demo/inspect?id=${CARD2}`]: inspected(CARD2, []),
  });
  await runAction(f.ctx, 'paste-style');
  const md = { kind: 'string', value: 'md' } as const;
  assert.deepEqual(f.gestures[0]?.ops, [
    {
      op: 'setProp',
      id: HEAD,
      name: 'gap',
      value: md,
      before: { kind: 'string', value: 'sm' },
      after: null,
    },
    { op: 'setProp', id: CARD2, name: 'gap', value: md, before: null, after: null },
  ] satisfies EditOp[]);
});

test('copy style keeps scss declarations and paste adds the class and rule once', async () => {
  const source = inspected(CARD, []);
  source.styles = {
    ...source.styles,
    padding: { kind: 'scss', className: 'plans', value: '', offKit: false },
  };
  source.scss = {
    file: 'src/scss/sections/pricing.scss',
    etag: ETAG,
    rule: true,
    declarations: [
      { property: 'padding', value: 'var(--kit-space-md)', offKit: false },
      { property: 'margin', value: 'var(--kit-space-sm)', offKit: false },
    ],
    nested: [],
  };
  const f = fixture([CARD], { inspected: source });
  await runAction(f.ctx, 'copy-style');
  f.store.set({ selection: [HEAD], inspected: null });
  stubFetch({ [`/api/v1/drafts/demo/inspect?id=${HEAD}`]: inspected(HEAD, []) });
  await runAction(f.ctx, 'paste-style');
  const ops = f.gestures[0]?.ops ?? [];
  assert.equal(ops.filter((op) => op.op === 'addClass').length, 1);
  assert.deepEqual(
    ops.filter((op) => op.op === 'setStyle').map((op) => op.op === 'setStyle' && op.newRule),
    [true, false],
  );
});

test('a part of a list item takes the element actions: Delete changes the template', async () => {
  const part: Inspect = {
    ...inspected(INNER, []),
    list: { kind: 'literal', count: 3, reason: null, root: false },
  };
  // Chosen on the second item's copy, it is still the one element every item shares.
  const f = fixture([INNER], { inspected: part, copies: [{ id: INNER, item: 1, path: [1] }] });
  assert.deepEqual(stateOf(f, 'delete'), { id: 'delete', enabled: true, reason: null });
  await runAction(f.ctx, 'delete');
  assert.deepEqual(f.gestures, [
    { ops: [{ op: 'removeElement', id: INNER, hash: HASH(13) }], label: 'actions.label.delete' },
  ]);
});
