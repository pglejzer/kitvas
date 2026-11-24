import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { EditorContext } from '../../../../../client/studio/edit/context.ts';
import { type Clip, createStore } from '../../../../../client/studio/edit/store.ts';
import {
  type ClipboardIo,
  copyElements,
  pasteClip,
} from '../../../../../client/studio/edit/structure/clipboard.ts';

const A = 'sections/Pricing:section/Stack/Card';
const B = 'sections/Pricing:section/Stack/Card.2';
const FILE = 'src/tsx/sections/Pricing.tsx';

type Fake = { io: ClipboardIo; written: string[]; asked: string[] };

function fake(options: { system?: string; denyRead?: boolean; denyWrite?: boolean } = {}): Fake {
  const written: string[] = [];
  const asked: string[] = [];
  const io: ClipboardIo = {
    subtree: async (_slug, id) => {
      asked.push(id);
      return {
        ok: true,
        status: 200,
        body: { id, file: FILE, hash: '0123456789abcdef', source: `<Text>${id}</Text>` },
      };
    },
    writeText: async (text) => {
      if (options.denyWrite) throw new Error('denied');
      written.push(text);
    },
    readText: async () => {
      if (options.denyRead) throw new Error('denied');
      return options.system ?? '';
    },
    now: () => 42,
  };
  return { io, written, asked };
}

function context(clip: Clip | null = null): EditorContext {
  const store = createStore('demo');
  store.set({ clipboard: clip });
  return { slug: 'demo', store } as unknown as EditorContext;
}

test('copy keeps the order of the ids and joins the sources', async () => {
  const ctx = context();
  const { io, written } = fake();
  const clip = await copyElements(ctx, [A, B], io);
  assert.deepEqual(clip?.items, [
    { source: `<Text>${A}</Text>`, from: FILE },
    { source: `<Text>${B}</Text>`, from: FILE },
  ]);
  assert.equal(clip?.text, `<Text>${A}</Text>\n<Text>${B}</Text>`);
  assert.equal(clip?.at, 42);
  assert.deepEqual(written, [clip?.text]);
  assert.equal(ctx.store.get().clipboard, clip);
});

test('copy orders ids by the document, not by the selection', async () => {
  const ctx = context();
  const entry = (id: string) => ({ id });
  ctx.store.set({
    structure: { elements: [entry(A), entry(B)] } as unknown as never,
  });
  const { io, asked } = fake();
  await copyElements(ctx, [B, A], io);
  assert.deepEqual(asked, [A, B]);
});

test('copy still keeps the clip when the system clipboard refuses the write', async () => {
  const ctx = context();
  const clip = await copyElements(ctx, [A], fake({ denyWrite: true }).io);
  assert.equal(clip?.items.length, 1);
  assert.equal(ctx.store.get().clipboard, clip);
});

test('copy gives null when an element cannot be read', async () => {
  const ctx = context();
  const { io } = fake();
  io.subtree = async () => ({ ok: false, status: 404, code: null });
  assert.equal(await copyElements(ctx, [A], io), null);
  assert.equal(ctx.store.get().clipboard, null);
});

test('paste prefers the editor clip when the system text is the same', async () => {
  const own: Clip = {
    items: [{ source: '<Text>a</Text>', from: FILE }],
    text: '<Text>a</Text>',
    at: 1,
  };
  const clip = await pasteClip(context(own), fake({ system: '<Text>a</Text>' }).io);
  assert.equal(clip, own);
});

test('paste of other JSX text becomes one item without a file', async () => {
  const own: Clip = {
    items: [{ source: '<Text>a</Text>', from: FILE }],
    text: '<Text>a</Text>',
    at: 1,
  };
  const clip = await pasteClip(context(own), fake({ system: '  <Badge>New</Badge>\n' }).io);
  assert.deepEqual(clip?.items, [{ source: '<Badge>New</Badge>', from: '' }]);
});

test('paste of plain text gives null', async () => {
  assert.equal(await pasteClip(context(), fake({ system: 'hello' }).io), null);
});

test('a denied read falls back to the editor clip, or null without one', async () => {
  const own: Clip = {
    items: [{ source: '<Text>a</Text>', from: FILE }],
    text: '<Text>a</Text>',
    at: 1,
  };
  assert.equal(await pasteClip(context(own), fake({ denyRead: true }).io), own);
  assert.equal(await pasteClip(context(), fake({ denyRead: true }).io), null);
});
