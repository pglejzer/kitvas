// The selection rectangle of the frame, heard on the page (ADR 0059). The frame draws it and says
// which copies it took (`rect`, ADR 0065); here they become the selection, as a click's `pick`
// does in `mode.ts`. Only in edit mode. The rule is `rectSelection` in `copies.ts`.

import type { EditorContext } from '../context.ts';
import { rectSelection, sameChosen } from './copies.ts';

export function mountRect(ctx: EditorContext): void {
  const { bridge, store } = ctx;
  bridge.on((message) => {
    if (message.type !== 'rect') return;
    const state = store.get();
    if (!state.on) return;
    const next = rectSelection(state, message.picks, message.add);
    if (!sameChosen(next, state)) store.set(next);
  });
}
