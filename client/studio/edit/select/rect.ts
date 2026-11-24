// The selection rectangle of the frame, heard on the page (ADR 0059). The frame draws it and says
// what it took (`rect`); here that becomes the selection, as a click's `pick` does in `mode.ts`.
// Only in edit mode.

import { MAX_SELECTED } from '../../../channel/edit-protocol.ts';
import type { EditorContext } from '../context.ts';

/**
 * The selection after a rectangle took `ids`: those, in the frame's document order. With `add`
 * (Shift, Ctrl or Cmd was held) the selection stays and the ones not in it yet come after it. A
 * rectangle that took nothing clears the selection, unless it adds. Never more than a `select`
 * message carries.
 */
export function rectSelection(
  current: readonly string[],
  ids: readonly string[],
  add: boolean,
): string[] {
  const next = add ? [...current] : [];
  const seen = new Set(next);
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    next.push(id);
  }
  return next.slice(0, MAX_SELECTED);
}

const sameIds = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((id, index) => id === b[index]);

export function mountRect(ctx: EditorContext): void {
  const { bridge, store } = ctx;
  bridge.on((message) => {
    if (message.type !== 'rect') return;
    const state = store.get();
    if (!state.on) return;
    const selection = rectSelection(state.selection, message.ids, message.add);
    if (!sameIds(selection, state.selection)) store.set({ selection });
  });
}
