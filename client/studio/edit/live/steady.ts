// A block above a pane that grows or shrinks by itself must not move what the person looks at in
// the pane (they may be in a drag in the colour picker): the pane scrolls on by the same amount,
// so its rows stay where they were on the screen. A change the person asked for (the block was
// opened or folded, another element was selected) is left alone: there the pane moves, as a fold
// does everywhere.

/** Where the pane scrolls to when the block above it went from `before` to `after` px. Pure. */
export function steadyScroll(scrollTop: number, before: number, after: number): number {
  // The block came or left whole: the pane was drawn anew with it, there is nothing to keep.
  if (before <= 0 || after <= 0) return scrollTop;
  return Math.max(0, scrollTop + (after - before));
}

export type Steady = {
  /** The next change of the block's height is the person's own: the pane is not scrolled for it. */
  own(): void;
};

/** Watches `block` and keeps the pane `scroller()` finds steady under it. */
export function keepSteady(block: HTMLElement, scroller: () => HTMLElement | null): Steady {
  let last = block.offsetHeight;
  let own = false;
  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(() => {
      const next = block.offsetHeight;
      const before = last;
      last = next;
      if (next === before) return;
      if (own) {
        own = false;
        return;
      }
      const pane = scroller();
      if (pane) pane.scrollTop = steadyScroll(pane.scrollTop, before, next);
    }).observe(block);
  }
  return {
    own() {
      own = true;
      // The observer answers in the frame the change is laid out in. A change that never came
      // (the same height again) must not swallow a later one: the mark goes after that frame.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          own = false;
        });
      });
    },
  };
}
