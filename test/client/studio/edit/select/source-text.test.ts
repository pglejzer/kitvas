// A double click on a text the source writes as `{…}` (ADR 0060): what the double click edits, the
// op it sends, and the flow through the frame's `locate-copy` and the server's `text-source`, with
// a fake bridge, history and `fetch`.

import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import type {
  EditFrameMessage,
  EditStudioBody,
  TreeNode,
} from '../../../../../client/channel/edit-protocol.ts';
import type { EditorContext } from '../../../../../client/studio/edit/context.ts';
import {
  createSourceText,
  doubleKind,
  locatedStep,
  sourceLabel,
  sourceOp,
} from '../../../../../client/studio/edit/select/source-text.ts';
import {
  createStore,
  type EditorState,
  type Gesture,
} from '../../../../../client/studio/edit/store.ts';
import { STYLE_PROPERTIES } from '../../../../../src/edit/index.ts';
import type { Inspect } from '../../../../../src/studio/api/edit/edit-schemas.ts';

const CARD = 'sections/Plans:section/Card';
const BUTTON = `${CARD}/Stack/Button`;

type InspectParts = Pick<Inspect, 'text' | 'list' | 'expression'>;

function inspectOf(id: string, parts: Partial<InspectParts>): Inspect {
  const styles = Object.fromEntries(
    STYLE_PROPERTIES.map((property) => [property, { kind: 'kit' }]),
  ) as Inspect['styles'];
  return {
    id,
    version: 2,
    hash: '0123456789abcdef',
    movable: 'in-expression',
    file: 'src/tsx/sections/Plans.tsx',
    etag: `"${'a'.repeat(27)}"`,
    tag: 'Button',
    component: null,
    props: [],
    spread: false,
    text: null,
    textRefusal: 'no-text',
    className: null,
    styleClass: null,
    scss: null,
    styles,
    list: null,
    ...parts,
  };
}

const node = (id: string, count: number): TreeNode => ({ id, parent: null, name: id, count });

/** The editor with `id` selected and inspected with `parts`, rendered `copies` times. */
function stateWith(id: string, parts: Partial<InspectParts>, copies = 3): EditorState {
  const store = createStore('demo');
  store.set({
    on: true,
    selection: [id],
    inspected: inspectOf(id, parts),
    tree: [node(id, copies)],
  });
  return store.get();
}

const ROOTS = { expression: { roots: [CARD] } };

test('a double click edits plain text, a literal item field, a text in code, or nothing', () => {
  assert.equal(doubleKind(stateWith(BUTTON, { text: 'Buy' }), BUTTON, null), 'text');
  const literal = { kind: 'literal' as const, count: 3, reason: null, texts: ['A', 'B', 'C'] };
  assert.equal(doubleKind(stateWith(BUTTON, { list: literal }), BUTTON, 1), 'item');
  assert.equal(doubleKind(stateWith(BUTTON, ROOTS), BUTTON, 1), 'source');
  // A literal list whose item shows no plain field is a text in code too.
  const field = { ...literal, texts: [null, null, null] };
  assert.equal(doubleKind(stateWith(BUTTON, { list: field, ...ROOTS }), BUTTON, 1), 'source');
  assert.equal(doubleKind(stateWith(BUTTON, {}), BUTTON, 1), 'none');
  // The source view of another element is not this one's.
  assert.equal(doubleKind(stateWith(CARD, ROOTS), BUTTON, 1), 'none');
});

test('the op writes the copy at its path; its item is the last place', () => {
  const target = { id: BUTTON, item: 4, path: [1, 2], before: 'SSO' };
  assert.deepEqual(sourceOp(target, 'SAML'), {
    op: 'setItemText',
    id: BUTTON,
    item: 2,
    path: [1, 2],
    value: 'SAML',
    before: 'SSO',
  });
  // Outside any list; the frame's text, when it differs from the one read, is the `before`.
  const outside = { id: BUTTON, item: null, path: [], before: 'Save' };
  assert.deepEqual(sourceOp(outside, 'Keep', 'Saved'), {
    op: 'setItemText',
    id: BUTTON,
    item: 0,
    path: [],
    value: 'Keep',
    before: 'Saved',
  });
  assert.equal(sourceLabel(target), 'lists.label.text');
  assert.equal(sourceLabel(outside), 'label.text');
});

test('a copy that shows elements opens nothing; a copy without its path is refused', () => {
  assert.equal(locatedStep({ path: [1], text: 'Buy' }), 'ask');
  assert.equal(locatedStep({ path: [], text: '' }), 'ask');
  assert.equal(locatedStep({ path: [1], text: null }), 'none');
  assert.deepEqual(locatedStep({ path: null, text: 'Buy' }), { refused: 'not-found' });
});

// The flow, with the frame and the server played by the test.

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

/** The server answers `text-source` with `reason`, and keeps each URL it was asked. */
function serverSays(reason: string | null): string[] {
  const asked: string[] = [];
  globalThis.fetch = async (input) => {
    asked.push(String(input));
    return new Response(JSON.stringify({ reason }), { status: 200 });
  };
  return asked;
}

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

type Flow = {
  store: ReturnType<typeof createStore>;
  sent: EditStudioBody[];
  gestures: Gesture[];
  /** A message from the frame. */
  frame(message: Record<string, unknown>): void;
  open(id: string, item: number | null): void;
};

/** The flow on a page whose history answers every gesture with `outcome`. */
function flow(outcome: string): Flow {
  const store = createStore('demo');
  store.set({ on: true, selection: [BUTTON], inspected: inspectOf(BUTTON, ROOTS) });
  const sent: EditStudioBody[] = [];
  const gestures: Gesture[] = [];
  const listeners: ((message: EditFrameMessage) => void)[] = [];
  let request = 0;
  const ctx = {
    slug: 'demo',
    store,
    bridge: {
      send: (body: EditStudioBody) => sent.push(body),
      on: (listener: (message: EditFrameMessage) => void) => listeners.push(listener),
      nextRequest: () => ++request,
    },
    history: {
      apply: async (gesture: Gesture) => {
        gestures.push(gesture);
        return { outcome };
      },
    },
  } as unknown as EditorContext;
  const source = createSourceText(ctx);
  const frame = (message: Record<string, unknown>): void => {
    const full = { kitvas: 1, channel: 'c', ...message } as unknown as EditFrameMessage;
    for (const listener of listeners) listener(full);
  };
  return { store, sent, gestures, frame, open: (id, item) => source.open(id, item) };
}

test('a text with its literal opens the editor on its copy and writes at its path', async () => {
  const asked = serverSays(null);
  const f = flow('applied');
  f.open(BUTTON, 1);
  assert.deepEqual(f.sent, [
    { type: 'locate-copy', request: 1, id: BUTTON, item: 1, roots: [CARD] },
  ]);
  f.frame({ type: 'copy-located', request: 1, id: BUTTON, path: [1], text: 'Try Pro' });
  await settle();
  assert.equal(asked.length, 1);
  assert.match(asked[0] ?? '', /\/text-source\?id=.*&text=Try%20Pro&path=1$/);
  assert.deepEqual(f.sent.at(-1), { type: 'edit-text', id: BUTTON, item: 1 });
  f.frame({ type: 'text', id: BUTTON, value: 'Try it', before: 'Try Pro' });
  await settle();
  assert.deepEqual(f.gestures.at(-1)?.ops, [
    { op: 'setItemText', id: BUTTON, item: 1, path: [1], value: 'Try it', before: 'Try Pro' },
  ]);
  assert.equal(f.sent.at(-1)?.type, 'edit-text');
});

test('a write that was not made puts the old text back in the frame', async () => {
  serverSays(null);
  const f = flow('refused');
  f.open(BUTTON, null);
  f.frame({ type: 'copy-located', request: 1, id: BUTTON, path: [0], text: 'Start' });
  await settle();
  f.frame({ type: 'text', id: BUTTON, value: 'Begin', before: 'Start' });
  await settle();
  assert.deepEqual(f.sent.at(-1), { type: 'text-back', id: BUTTON });
});

test('a text without its literal is refused at once, with the reason, and opens nothing', async () => {
  serverSays('computed');
  const f = flow('applied');
  f.open(BUTTON, 2);
  f.frame({ type: 'copy-located', request: 1, id: BUTTON, path: [2], text: 'Try Business' });
  await settle();
  assert.equal(f.sent.at(-1)?.type, 'locate-copy');
  const refused = f.store.get().refused;
  assert.equal(refused?.reason, 'computed');
  assert.deepEqual(refused?.gesture.ops, [
    {
      op: 'setItemText',
      id: BUTTON,
      item: 2,
      path: [2],
      value: 'Try Business',
      before: 'Try Business',
    },
  ]);
});

test('a container, an old answer and an unchanged text do nothing', async () => {
  const asked = serverSays(null);
  const f = flow('applied');
  f.open(BUTTON, null);
  // An answer to another request is not this one.
  f.frame({ type: 'copy-located', request: 7, id: BUTTON, path: [0], text: 'Start' });
  f.frame({ type: 'copy-located', request: 1, id: BUTTON, path: [0], text: null });
  await settle();
  assert.equal(asked.length, 0);
  assert.equal(f.sent.length, 1);
  assert.equal(f.store.get().refused, null);
  f.open(BUTTON, null);
  f.frame({ type: 'copy-located', request: 2, id: BUTTON, path: [0], text: 'Start' });
  await settle();
  f.frame({ type: 'text', id: BUTTON, value: 'Start', before: 'Start' });
  await settle();
  assert.deepEqual(f.gestures, []);
});
