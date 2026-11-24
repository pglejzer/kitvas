// Copy, cut and paste (spec 4b, clipboard; plan 14, task D4): the editor keeps each element's source and
// file, and the system clipboard gets the JSX text. Paste uses the editor's copy while the system
// clipboard still holds that text, otherwise the system clipboard's JSX.

import { getSubtree } from './api.ts';
import type { EditorContext } from './context.ts';
import type { Clip } from './store.ts';

type SubtreeAnswer = Awaited<ReturnType<typeof getSubtree>>;

/** The system clipboard and the network, replaceable in tests (as `HistoryIo` is in history.ts). */
export type ClipboardIo = {
  subtree: (slug: string, id: string) => Promise<SubtreeAnswer>;
  writeText: (text: string) => Promise<void>;
  readText: () => Promise<string>;
  now: () => number;
};

export const defaultClipboardIo: ClipboardIo = {
  subtree: getSubtree,
  writeText: (text) => navigator.clipboard.writeText(text),
  readText: () => navigator.clipboard.readText(),
  now: () => Date.now(),
};

/** Ids in the order they stand in the document; ids the structure does not know keep their order. */
function inDocumentOrder(ctx: EditorContext, ids: readonly string[]): string[] {
  const elements = ctx.store.get().structure?.elements;
  const unique = [...new Set(ids)];
  if (!elements) return unique;
  const position = new Map(elements.map((entry, index) => [entry.id, index]));
  const at = (id: string): number => position.get(id) ?? Number.MAX_SAFE_INTEGER;
  return unique
    .map((id, index) => ({ id, index }))
    .sort((a, b) => at(a.id) - at(b.id) || a.index - b.index)
    .map((item) => item.id);
}

/** Reads the elements' sources (`GET …/subtree`), keeps them in the store, writes the text out. */
export async function copyElements(
  ctx: EditorContext,
  ids: readonly string[],
  io: ClipboardIo = defaultClipboardIo,
): Promise<Clip | null> {
  const ordered = inDocumentOrder(ctx, ids);
  if (ordered.length === 0) return null;
  const answers = await Promise.all(ordered.map((id) => io.subtree(ctx.slug, id)));
  const items: Clip['items'] = [];
  for (const answer of answers) {
    if (!answer.ok) return null;
    items.push({ source: answer.body.source, from: answer.body.file });
  }
  const newline = items.some((item) => item.source.includes('\r\n')) ? '\r\n' : '\n';
  const clip: Clip = {
    items,
    text: items.map((item) => item.source).join(newline),
    at: io.now(),
  };
  ctx.store.set({ clipboard: clip });
  try {
    await io.writeText(clip.text);
  } catch {
    // The system clipboard may be denied; the editor's own copy still works.
  }
  return clip;
}

/** What a paste inserts now; `null` when there is nothing to paste. */
export async function pasteClip(
  ctx: EditorContext,
  io: ClipboardIo = defaultClipboardIo,
): Promise<Clip | null> {
  const own = ctx.store.get().clipboard;
  let system: string;
  try {
    system = await io.readText();
  } catch {
    return own;
  }
  if (own !== null && system === own.text) return own;
  const text = system.trim();
  if (text.startsWith('<') && text.endsWith('>')) {
    return { items: [{ source: text, from: '' }], text: system, at: io.now() };
  }
  return null;
}
