// The screen shows once (`src/studio/pages/editor/first-layout.ts`). The server's page comes
// marked `data-opening`, unseen. Every part that is not there when the page script has run holds
// the screen back (`hold`): a frame until its page has drawn, the Layers pane in Edit until the
// frame has sent its tree. When the last one lets go the mark comes off, and the person sees the
// whole editor in one step, nothing of it moving or changing afterwards.

export type Opening = {
  /** A part the screen waits for; call the answer once that part is there. */
  hold(): () => void;
  /** Every part has said what it waits for: the screen shows when the last one lets go. */
  start(): void;
};

/** `show` is called once: after `start`, when nothing holds the screen back any more. */
export function createOpening(show: () => void): Opening {
  let held = 0;
  let started = false;
  let shown = false;
  const check = (): void => {
    if (!started || held > 0 || shown) return;
    shown = true;
    show();
  };
  return {
    hold() {
      held += 1;
      let free = false;
      return () => {
        if (free) return;
        free = true;
        held -= 1;
        check();
      };
    },
    start() {
      started = true;
      check();
    },
  };
}

/**
 * Takes the opening mark off `main`. What entered while the screen was unseen (a pill, a pane's
 * content) ends its entrance first: the screen opens in one step, with nothing still rising in.
 */
export function showScreen(main: HTMLElement): void {
  if (typeof main.getAnimations === 'function') {
    for (const motion of main.getAnimations({ subtree: true })) {
      // A transition is left alone, and so is a motion without an end: it cannot be finished.
      if (!(motion instanceof CSSAnimation)) continue;
      const end = motion.effect?.getComputedTiming().endTime;
      if (typeof end === 'number' && Number.isFinite(end)) motion.finish();
    }
  }
  main.removeAttribute('data-opening');
}
