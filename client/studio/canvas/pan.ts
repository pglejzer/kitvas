// Panning the canvas (plan 15, task B): Space+drag and the middle button. Space may be held on the
// page or in a frame, which forwards it (`space`). While it is held a shield lies over the cards
// and takes the pointer, so a drag that starts over a frame pans instead of reaching the frame.
// Only the canvas scrolls; the window never does.

/** What the pan knows: Space held on the page, Space held in a frame, a drag going on. */
export type PanState = { page: boolean; frame: boolean; dragging: boolean };

/**
 * What the canvas shows for a state. The shield stays up through a drag even when Space was let
 * go first, so the frame under the pointer never gets the rest of the drag.
 */
export function panView(state: PanState): { shield: boolean; cursor: 'grab' | 'grabbing' | null } {
  const held = state.page || state.frame;
  if (state.dragging) return { shield: true, cursor: 'grabbing' };
  return { shield: held, cursor: held ? 'grab' : null };
}

/** The parts of a key event's target the check reads. */
export type KeyTarget = { tagName?: string; isContentEditable?: boolean } | null;

/** Space belongs to the element: typing in a field, or pressing a button, a link or a summary. */
export function keepsSpace(target: KeyTarget): boolean {
  if (!target) return false;
  if (target.isContentEditable === true) return true;
  const tag = (target.tagName ?? '').toUpperCase();
  return ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A', 'SUMMARY'].includes(tag);
}

export type Pan = {
  /** A frame said Space went down or up while it had the keys. */
  frameSpace(down: boolean): void;
};

export function mountPan(scroll: HTMLElement, shield: HTMLElement | null): Pan {
  const state: PanState = { page: false, frame: false, dragging: false };
  let last: { x: number; y: number } | null = null;

  function render(): void {
    const view = panView(state);
    if (shield) shield.hidden = !view.shield;
    scroll.toggleAttribute('data-pan', view.cursor === 'grab');
    scroll.toggleAttribute('data-panning', view.cursor === 'grabbing');
  }

  function set(patch: Partial<PanState>): void {
    Object.assign(state, patch);
    render();
  }

  document.addEventListener('keydown', (event) => {
    if (event.code !== 'Space' || event.ctrlKey || event.metaKey || event.altKey) return;
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (keepsSpace(target)) return;
    // Space would scroll whatever has focus.
    event.preventDefault();
    if (!state.page) set({ page: true });
  });
  document.addEventListener('keyup', (event) => {
    if (event.code === 'Space' && state.page) set({ page: false });
  });
  // The key may come up in another window or in a frame.
  window.addEventListener('blur', () => {
    if (state.page) set({ page: false });
  });

  function start(event: PointerEvent): void {
    event.preventDefault();
    last = { x: event.clientX, y: event.clientY };
    try {
      scroll.setPointerCapture(event.pointerId);
    } catch {
      // A pointer that is already gone: the drag ends with the next `pointerup`.
    }
    set({ dragging: true });
  }

  function stop(): void {
    if (!last) return;
    last = null;
    set({ dragging: false });
  }

  if (shield) {
    shield.addEventListener('pointerdown', (event) => {
      if (event.button === 0) start(event);
    });
    // A press that moved focus out of the frame would end the frame's Space there.
    shield.addEventListener('mousedown', (event) => event.preventDefault());
  }
  // The middle button would start the browser's own auto-scroll.
  scroll.addEventListener('mousedown', (event) => {
    if (event.button === 1) event.preventDefault();
  });
  scroll.addEventListener('pointerdown', (event) => {
    if (event.button === 1) start(event);
  });
  scroll.addEventListener('pointermove', (event) => {
    if (!last) return;
    scroll.scrollLeft -= event.clientX - last.x;
    scroll.scrollTop -= event.clientY - last.y;
    last = { x: event.clientX, y: event.clientY };
  });
  scroll.addEventListener('pointerup', stop);
  scroll.addEventListener('pointercancel', stop);
  scroll.addEventListener('lostpointercapture', stop);

  render();
  return {
    frameSpace(down) {
      if (state.frame !== down) set({ frame: down });
    },
  };
}
