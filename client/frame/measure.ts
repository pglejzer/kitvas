// The answer to `measure`: one snapshot per `[data-ks]` element, in document order, taken once the
// page has stopped moving.

import type { ElementSnapshot } from '../channel/protocol.ts';
import { type RawElement, takeSnapshots } from './snapshot.ts';

/** A measure never waits longer than this for motion to end. */
const SETTLE_LIMIT_MS = 1000;

function* rawElements(): Generator<RawElement> {
  for (const element of document.querySelectorAll('[data-ks]')) {
    const box = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    yield {
      id: element.getAttribute('data-ks') ?? '',
      width: box.width,
      height: box.height,
      text: element.textContent,
      read: (name) => style.getPropertyValue(name),
    };
  }
}

export function measureElements(): ElementSnapshot[] {
  return takeSnapshots(rawElements());
}

/** Running and bound to end: endless animations (a spinner) are not waited for. */
function ending(animation: Animation): boolean {
  if (animation.playState !== 'running') return false;
  const end = animation.effect?.getComputedTiming().endTime;
  return typeof end === 'number' && Number.isFinite(end);
}

/**
 * Resolves once the page's finite animations and transitions have ended, at most after
 * `SETTLE_LIMIT_MS`. A box measured mid-motion has the size of a frame of the motion, and a
 * colour mid-transition is neither the old one nor the new one.
 */
export async function settle(): Promise<void> {
  if (typeof document.getAnimations !== 'function') return;
  const running = document.getAnimations().filter(ending);
  if (running.length === 0) return;
  const limit = new Promise<void>((done) => setTimeout(done, SETTLE_LIMIT_MS));
  await Promise.race([Promise.allSettled(running.map((animation) => animation.finished)), limit]);
}
