// A list item reordered in the frame (ADR 0059): the frame has already moved the copy as a preview
// and posted `reorder` with the item's place and the place it goes to. This writes it to the data
// through the history, as Move up and Move down do (`lists.ts`), and keeps the item picked. When
// the server does not apply it, nothing was written and no build follows, so the frame is loaded
// again to show the code as it is instead of the preview.

import type { EditOp } from '../../../../src/edit/index.ts';
import type { EditorContext } from '../context.ts';
import { reloadFrame } from '../insert/frame-drop.ts';
import { text } from '../texts.ts';

/** What the frame says of a reordered item: copy `item` of `id` goes to index `to`. */
export type Reorder = { id: string; item: number; to: number };

/** The op a reorder makes; `null` for an item dropped on its own place, which writes nothing. */
export function reorderOp(move: Reorder): EditOp | null {
  if (move.item === move.to) return null;
  return { op: 'moveItem', id: move.id, item: move.item, to: move.to };
}

export function mountReorder(ctx: EditorContext): void {
  const { bridge, store, history } = ctx;
  bridge.on((message) => {
    if (message.type !== 'reorder' || !store.get().on) return;
    const { id, to } = message;
    const op = reorderOp(message);
    if (op === null) return;
    void history.apply({ ops: [op], label: text('lists.label.reorder') }).then((outcome) => {
      if (outcome?.outcome !== 'applied') {
        reloadFrame(bridge);
        return;
      }
      // The moved item stays the picked one, at its new place.
      if (store.get().selection[0] === id) store.set({ item: to });
    });
  });
}
