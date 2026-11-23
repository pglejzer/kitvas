// The example frame's side of the studio channel, bundled into a kit's catalog as `kitvas-example`.
// The generated entry hands it the keys of the examples it holds and a `render` that commits
// synchronously. It renders the example `?example=<key>` names and marks the page with the result
// (`<html data-example="shown|failed">`); inside the studio's kit page it then tells the page
// whether the example was shown and how tall the page is, so the page can size the frame. The
// studio never sends an example frame anything, so nothing here listens.

import { type FrameMessage, MAX_SIZE, readHash } from '../channel/protocol.ts';
import { settle } from './measure.ts';

export type ExampleInput = {
  /** Keys of the examples this bundle holds, in catalog order. */
  keys: readonly string[];
  /** Renders one example; true when it rendered, false when it threw (caught by an error boundary). */
  render(key: string): boolean;
};

/** The part of an element's box the height needs; a `DOMRect` has it. */
export type Box = { bottom: number };

/**
 * The size goes out again after these delays: the kit page's script may start after the frame,
 * and a message sent before its listener exists is lost. Fonts and images that arrive late change
 * the height as well.
 */
const AGAIN_MS = [500, 1500, 4000];

/** The example `?example=` asks for, when this bundle holds it; `undefined` for anything else. */
export function chosenExample(search: string, keys: readonly string[]): string | undefined {
  const asked = new URLSearchParams(search).get('example');
  return asked !== null && keys.includes(asked) ? asked : undefined;
}

/**
 * The page's height in whole CSS pixels: the largest of `base` (the bottom of the body) and the
 * bottom of every box plus `gap` (viewport coordinates plus `scrollY`). A modal `<dialog>` or a
 * portal sits outside the body's flow, so the boxes count it; `gap` keeps the body's padding below
 * it. Values that are no finite number are skipped; the result is in the range the protocol accepts.
 */
export function exampleHeight(
  base: number,
  boxes: Iterable<Box>,
  scrollY: number,
  gap = 0,
): number {
  const offset = Number.isFinite(scrollY) ? scrollY : 0;
  const below = Number.isFinite(gap) && gap > 0 ? gap : 0;
  let largest = Number.isFinite(base) ? base : 0;
  for (const box of boxes) {
    const bottom = box.bottom + offset + below;
    if (Number.isFinite(bottom) && bottom > largest) largest = bottom;
  }
  return Math.min(Math.max(Math.ceil(largest), 0), MAX_SIZE);
}

/** A `render` that throws past the error boundary (a provider failed) shows nothing either. */
function renderSafely(render: ExampleInput['render'], key: string): boolean {
  try {
    return render(key) === true;
  } catch (error) {
    reportError(error);
    return false;
  }
}

/** Every element of the body, portals and the top layer included. */
function* bodyBoxes(): Generator<Box> {
  for (const element of document.body.querySelectorAll('*')) yield element.getBoundingClientRect();
}

/**
 * The body's own box, not the document's scroll height: the scroll height never drops below the
 * frame, so a frame that started taller than its example could never shrink to it.
 */
function measureHeight(): number {
  const { body } = document;
  const gap = Number.parseFloat(getComputedStyle(body).paddingBottom);
  return exampleHeight(body.getBoundingClientRect().bottom + scrollY, bodyBoxes(), scrollY, gap);
}

/** Calls `report` when the page's size changes, at most once per animation frame. */
function watchSize(report: () => void): void {
  if (typeof ResizeObserver !== 'function') return;
  let frame = 0;
  const observer = new ResizeObserver(() => {
    if (frame !== 0) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      report();
    });
  });
  observer.observe(document.documentElement);
  observer.observe(document.body);
}

/**
 * What the page says about its example on `<html data-example>`, framed or not: `kit verify`
 * opens the page without the studio and reads it there.
 */
export const exampleMark = (shown: boolean): 'shown' | 'failed' => (shown ? 'shown' : 'failed');

export function startExample({ keys, render }: ExampleInput): void {
  const key = chosenExample(location.search, keys);
  const shown = key !== undefined && renderSafely(render, key);
  document.documentElement.dataset.example = exampleMark(shown);
  const link = readHash(location.hash);
  // Not framed, or no channel asked for: the example is on the page, nothing more to do.
  if (!link || window.parent === window) return;

  const { channel } = link;
  const studio = window.parent;
  // The studio and the prototype origin share the host name; only the port differs. `URL` writes
  // it the way `event.origin` does (no `:80`).
  const studioOrigin = new URL(`http://${location.hostname}:${link.studioPort}`).origin;
  const report = (): void => {
    const message: FrameMessage = {
      kitvas: 1,
      channel,
      type: 'example',
      shown,
      height: measureHeight(),
    };
    studio.postMessage(message, studioOrigin);
  };

  // `render` has committed the example by now.
  report();
  settle().then(report, report);
  for (const delay of AGAIN_MS) setTimeout(report, delay);
  watchSize(report);
}
