// A move dropped in the frame (spec 4b, decision 11): the frame has already moved the nodes as a
// preview and posted `drop` with the dragged ids and the slot. This sends the moves through the
// history, like a drop in the layers tree. When the server does not apply them (a refusal, a
// conflict, an error), nothing was written and no build follows, so the frame is loaded again to
// show the code as it is instead of the preview.

import type { EditOp } from '../../../../src/edit/index.ts';
import type { Structure } from '../../../../src/studio/api/edit/structure-schemas.ts';
import type { Place } from '../../../channel/structure-protocol.ts';
import type { EditorContext } from '../context.ts';
import { text } from '../texts.ts';
import { mountFileDrop } from './file-drop.ts';

/**
 * The moves a drop makes, one per dragged id in document order. The first goes to the slot; each
 * next one goes right after the one before it, so the group keeps its order (ids name elements
 * as they were before the request, which the server follows through every op).
 */
export function frameMoveOps(
  ids: readonly string[],
  slot: { anchor: string; place: Place },
  structure: Structure,
): EditOp[] {
  const order = structure.elements.map((entry) => entry.id);
  const hashes = new Map(structure.elements.map((entry) => [entry.id, entry.hash]));
  const sorted = [...ids].sort((a, b) => order.indexOf(a) - order.indexOf(b));
  return sorted.map((id, index): EditOp => {
    const previous = sorted[index - 1];
    const at = previous === undefined ? slot : { anchor: previous, place: 'after' as const };
    const hash = hashes.get(id);
    return { op: 'moveElement', id, ...at, ...(hash === undefined ? {} : { hash }) };
  });
}

/**
 * Loads the edit card's frame again from the code as it is: it still shows the preview of a drop
 * or of a reordered item that was not written.
 */
export function reloadFrame(bridge: Pick<EditorContext['bridge'], 'frame'>): void {
  const frame = bridge.frame.element;
  const again = frame.src;
  frame.src = again;
}

export function mountFrameDrop(ctx: EditorContext): void {
  const { bridge, store, history } = ctx;
  // A file dragged in from the desktop (spec 4c, goal 10) is the same kind of drop.
  mountFileDrop(ctx);
  bridge.on((message) => {
    if (message.type !== 'drop' || message.source.kind !== 'move') return;
    const { structure } = store.get();
    if (!structure) return;
    const slot = { anchor: message.anchor, place: message.place };
    const ops = frameMoveOps(message.source.ids, slot, structure);
    if (ops.length === 0) return;
    void history.apply({ ops, label: text('layers.move') }).then((outcome) => {
      if (outcome?.outcome !== 'applied') reloadFrame(bridge);
    });
  });
}
