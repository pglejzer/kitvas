// A state the kit itself styles (ADR 0055): when the state bar forces Hover, Focus or Active, the
// edit card's frame says which properties a rule of the kit for that state holds on the selected
// element with more weight than the editor's own `.class:hover`. A value the editor wrote there
// would never show, so the row says so before anything is written and offers Ask Claude.

import type { StyleState } from '../../../../src/edit/index.ts';
import type { EditorContext } from '../context.ts';
import type { EditorState } from '../store.ts';

/** The answer for one element in one state: the CSS longhands the kit's rules hold. */
export type StateHeld = { id: string; state: StyleState; longhands: string[] };

const SIDES: Record<'block' | 'inline', readonly string[]> = {
  block: ['top', 'bottom'],
  inline: ['left', 'right'],
};

/** Whether setting the longhand `longhand` also sets the editor's property `property`. */
export function covers(property: string, longhand: string): boolean {
  if (longhand === property || longhand.startsWith(`${property}-`)) return true;
  const logical = /^(padding|margin)-(block|inline)$/.exec(property);
  if (logical) {
    const box = logical[1] ?? '';
    const axis = logical[2] === 'block' ? 'block' : 'inline';
    return SIDES[axis].some((side) => longhand === `${box}-${side}`);
  }
  const border = /^border-(color|width|style)$/.exec(property);
  if (border) {
    const part = border[1] ?? '';
    return new RegExp(`^border-(top|right|bottom|left|block|inline)(-start|-end)?-${part}$`).test(
      longhand,
    );
  }
  if (property === 'border-radius') return /^border-[a-z-]+-radius$/.test(longhand);
  if (property === 'gap') return longhand === 'row-gap' || longhand === 'column-gap';
  return false;
}

/** The kit's own state rule holds `property` on the selected element in the state edited now. */
export function kitHolds(state: EditorState, property: string): boolean {
  const { stateHeld, context, selection } = state;
  if (stateHeld === null || context.state === null || selection.length !== 1) return false;
  if (stateHeld.id !== selection[0] || stateHeld.state !== context.state) return false;
  return stateHeld.longhands.some((longhand) => covers(property, longhand));
}

/** Waits this long after a state pick, so the frame has the force message first. */
const ASK_MS = 60;

export function mountStateHeld(ctx: EditorContext): void {
  const { store, bridge } = ctx;
  let request = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let asked: { request: number; id: string; state: StyleState } | null = null;

  const ask = (): void => {
    timer = null;
    const { on, selection, context } = store.get();
    const [id] = selection;
    if (!on || selection.length !== 1 || id === undefined || context.state === null) return;
    const [edit] = bridge.frames();
    if (!edit) return;
    request = bridge.nextRequest();
    asked = { request, id, state: context.state };
    bridge.sendLive({ type: 'state-held', request, id }, edit);
  };

  bridge.onLive((_frame, message) => {
    if (message.type !== 'state-held' || asked === null) return;
    if (message.request !== asked.request || message.id !== asked.id) return;
    const { id, state } = asked;
    store.set({ stateHeld: { id, state, longhands: message.longhands } });
  });

  store.subscribe((state, previous) => {
    const moved =
      state.selection[0] !== previous.selection[0] ||
      state.context.state !== previous.context.state ||
      state.on !== previous.on;
    // A new build may bring other kit rules: ask again for the same element and state.
    if (!moved && state.builds === previous.builds) return;
    if (moved && state.stateHeld !== null) store.set({ stateHeld: null });
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(ask, ASK_MS);
  });
}
