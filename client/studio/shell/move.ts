// A panel's fold as one move (plan 18, task A; spec goal 7). A panel folds and opens, and Preview
// and Edit trade places, over the studio's slow motion. While it moves, `main[data-moving]` turns
// the panels' width transition on (`src/studio/pages/skin/editor/body.ts`). The canvas follows its
// room on every frame of the move (`canvas/canvas.ts`), so the draft glides with the panel: a fit
// kept for the move's end made it jump. The end is the panel's `transitionend`, a timer when that
// never comes, and at once under reduced motion.

/** The attribute on `main` while a panel moves. */
export const MOVING = 'data-moving';

/** The slow motion when its token (`--st-motion-slow`) cannot be read. */
export const SLOW_MS = 240;

/** What the timer waits beyond the motion before it ends a move whose `transitionend` never came. */
export const MOVE_MARGIN_MS = 80;

const REDUCED_QUERY = '(prefers-reduced-motion: reduce)';

/** A CSS time in milliseconds: `240ms` or `0.24s`; `null` for anything else. */
export function cssTime(value: string): number | null {
  const match = /^\s*(\d*\.?\d+)(ms|s)\s*$/.exec(value);
  const amount = Number(match?.[1]);
  if (!match || !Number.isFinite(amount)) return null;
  return Math.round(match[2] === 's' ? amount * 1000 : amount);
}

/**
 * How long a move may take before the timer ends it: the slow motion and a margin. `0` under
 * reduced motion, where nothing moves and there is no move to wait for.
 */
export function moveWait(slow: string, reduced: boolean): number {
  if (reduced) return 0;
  return (cssTime(slow) ?? SLOW_MS) + MOVE_MARGIN_MS;
}

export type Mover = {
  /** A fold is about to change: called before the change, so the transition applies to it. */
  start(): void;
};

/** Marks `main` while a panel's width moves, and ends the mark when the move is over. */
export function createMover(main: HTMLElement): Mover {
  const reduced = typeof window.matchMedia === 'function' ? window.matchMedia(REDUCED_QUERY) : null;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const end = (): void => {
    clearTimeout(timer);
    timer = undefined;
    main.removeAttribute(MOVING);
  };

  main.addEventListener('transitionend', (event) => {
    if (!main.hasAttribute(MOVING) || event.propertyName !== 'width') return;
    if (event.target instanceof Element && event.target.matches('aside[data-side]')) end();
  });

  return {
    start() {
      const slow = getComputedStyle(main).getPropertyValue('--st-motion-slow');
      const wait = moveWait(slow, reduced?.matches === true);
      clearTimeout(timer);
      if (wait === 0) {
        end();
        return;
      }
      main.setAttribute(MOVING, '');
      timer = setTimeout(end, wait);
    },
  };
}
