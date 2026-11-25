// The page scrolls under a drag whose pointer is near the frame's top or bottom edge (ADR 0066),
// faster the nearer it is, so a drop can reach a place that is not in view. `edgeScroll` is the
// rule, with no DOM; `createAutoScroll` runs it once per animation frame while the pointer stays
// there. The scroll event that follows lets `drag.ts` find the slot again.

/** Within this of the top or the bottom edge the page scrolls, in pixels on the screen. */
export const EDGE_ZONE = 48;
/** The speed where the zone begins and at the edge itself, in pixels on the screen per second. */
export const MIN_SPEED = 60;
export const MAX_SPEED = 900;
/** A step never counts more time than this: a frame that came late does not jump the page. */
const MAX_STEP_MS = 50;

/**
 * How fast the page scrolls with the pointer at `y` in a viewport `height` high, both in frame
 * pixels: frame pixels per second, negative upwards, 0 outside the zones. `scale`: frame pixels
 * per pixel on the screen, so the zone and the speed are the same on the screen at any canvas
 * zoom. A pointer past an edge (it is captured) scrolls at the full speed.
 */
export function edgeScroll(y: number, height: number, scale = 1): number {
  if (!(height > 0) || !(scale > 0) || !Number.isFinite(y)) return 0;
  // In a frame lower than two zones they meet in the middle.
  const zone = Math.min(EDGE_ZONE * scale, height / 2);
  const up = zone - y;
  const down = y - (height - zone);
  const depth = Math.max(up, down);
  if (depth <= 0) return 0;
  const share = Math.min(depth / zone, 1);
  const speed = (MIN_SPEED + (MAX_SPEED - MIN_SPEED) * share) * scale;
  return up > down ? -speed : speed;
}

export type AutoScrollDeps = {
  /** The viewport's height in frame pixels. */
  height(): number;
  /** Frame pixels per pixel on the screen. */
  scale(): number;
  /** Scrolls the page down by `dy` frame pixels at once (up when negative). */
  scrollBy(dy: number): void;
  /** `requestAnimationFrame` and `cancelAnimationFrame`. */
  frame(step: (time: number) => void): number;
  cancel(handle: number): void;
};

export type AutoScroll = {
  /** The pointer of the drag is at `y` (frame pixels from the viewport's top). */
  at(y: number): void;
  /** The drag ended. */
  stop(): void;
};

export function createAutoScroll(deps: AutoScrollDeps): AutoScroll {
  let y: number | undefined;
  let handle: number | undefined;
  /** When the step before ran; `undefined` before the first one. */
  let before: number | undefined;

  function step(time: number): void {
    handle = undefined;
    const speed = y === undefined ? 0 : edgeScroll(y, deps.height(), deps.scale());
    if (speed === 0) {
      before = undefined;
      return;
    }
    // The first step has no time behind it: it only starts the clock.
    const passed = before === undefined ? 0 : Math.min(Math.max(time - before, 0), MAX_STEP_MS);
    before = time;
    if (passed > 0) deps.scrollBy((speed * passed) / 1000);
    handle = deps.frame(step);
  }

  return {
    at(next) {
      y = next;
      if (handle !== undefined) return;
      if (edgeScroll(next, deps.height(), deps.scale()) === 0) return;
      before = undefined;
      handle = deps.frame(step);
    },
    stop() {
      y = undefined;
      before = undefined;
      if (handle !== undefined) deps.cancel(handle);
      handle = undefined;
    },
  };
}
