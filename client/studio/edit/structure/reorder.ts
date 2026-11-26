// A list item dropped at another place in the frame (ADR 0059, ADR 0065): the frame has already
// moved the copy as a preview and posted `reorder` with the path it came from and the path it
// goes to, in its own list or in the same list of another parent. This writes it to the data
// through the history, as Move up and Move down do (`lists.ts`), and keeps the moved item chosen
// at its new place. When the server does not apply it, nothing was written and no build follows,
// so the frame is loaded again to show the code as it is instead of the preview; a refusal's
// reason is said over the canvas (`refusal-note.ts` hears every refused edit).

import type { EditOp } from '../../../../src/edit/index.ts';
import { samePath } from '../../../../src/shared/values/paths.ts';
import type { CopyRef } from '../../../channel/edit-protocol.ts';
import { inspect } from '../api.ts';
import type { EditorContext } from '../context.ts';
import { reloadFrame } from '../insert/frame-drop.ts';
import { chosenCopy } from '../select/copies.ts';
import { text } from '../texts.ts';

/** What the frame says of a dropped item: the copy at `from` of `id` goes to `to`. */
export type Reorder = { id: string; from: readonly number[]; to: readonly number[] };

/**
 * The op a reorder makes: one move of the item in the data, by its path. `null` for an item
 * dropped on its own place, and for two paths that name no one list, which write nothing.
 */
export function reorderOp(move: Reorder): EditOp | null {
  const item = move.from[move.from.length - 1];
  const to = move.to[move.to.length - 1];
  if (item === undefined || to === undefined || move.from.length !== move.to.length) return null;
  if (samePath(move.from, move.to)) return null;
  return { op: 'moveItem', id: move.id, item, to, path: [...move.from], toPath: [...move.to] };
}

/**
 * The moved copy at its new place, when its place among all the copies follows from the one it
 * had: it stayed in its own list, so it moved as far as its place in the list did. `item` is
 * left out when the copy went to another parent's list, or was not the chosen one before.
 */
export function movedCopy(move: Reorder, before: CopyRef | null): CopyRef {
  const from = move.from[move.from.length - 1] ?? 0;
  const to = move.to[move.to.length - 1] ?? 0;
  const stayed = samePath(move.from.slice(0, -1), move.to.slice(0, -1));
  const known =
    stayed &&
    before !== null &&
    before.id === move.id &&
    before.item !== undefined &&
    (before.path === undefined || samePath(before.path, move.from));
  return {
    id: move.id,
    ...(known && before?.item !== undefined ? { item: before.item + (to - from) } : {}),
    path: [...move.to],
  };
}

export function mountReorder(ctx: EditorContext): void {
  const { bridge, store, history, slug } = ctx;

  /** The moved item is the chosen one, at its new place. */
  async function choose(move: Reorder, before: CopyRef | null): Promise<void> {
    const copy = movedCopy(move, before);
    store.set({ selection: [move.id], copies: [copy] });
    if (copy.item !== undefined) return;
    // In another parent's list: the server counts where that place is among the copies.
    const answer = await inspect(slug, move.id, move.to);
    const place = answer.ok ? (answer.body.list?.copy ?? null) : null;
    const state = store.get();
    const now = chosenCopy(state.selection, state.copies);
    // Another selection made since stays as it is.
    if (place === null || now === null || now.id !== move.id || now.item !== undefined) return;
    if (now.path === undefined || !samePath(now.path, move.to)) return;
    store.set({ selection: [move.id], copies: [{ ...copy, item: place }] });
  }

  bridge.on((message) => {
    if (message.type !== 'reorder' || !store.get().on) return;
    const move: Reorder = { id: message.id, from: message.from, to: message.to };
    const op = reorderOp(move);
    if (op === null) return;
    const state = store.get();
    const before = chosenCopy(state.selection, state.copies);
    void history.apply({ ops: [op], label: text('lists.label.reorder') }).then(async (outcome) => {
      if (outcome?.outcome !== 'applied') {
        reloadFrame(bridge);
        return;
      }
      await choose(move, before);
    });
  });
}
