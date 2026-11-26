// What a handle's drag comes to (ADR 0059), with no DOM: the value follows the pointer pixel by
// pixel, and a step of the kit's scale (for a width also `auto` and `100%`) takes it over only
// while the value is within the magnet's reach of it. Shift switches the magnet off. `handles.ts`
// gives it the pointer and the element's measures.

import type { HandleValue, ScaleStep } from '../../../channel/structure-protocol.ts';
import type { Point } from '../slots/slots.ts';
import type { Spot } from './spots.ts';

export type Scales = { space: readonly ScaleStep[]; size: readonly ScaleStep[] };
/** One property a drag changes: `sign` 1 when moving right or down makes the value larger. */
export type Track = { property: string; axis: 'x' | 'y'; sign: 1 | -1 };
/** A value the magnet holds a handle at, with its size in the element's own pixels. */
export type Candidate = { value: HandleValue; px: number; label: string };
/** What `width: auto` and `width: 100%` come to on the element, measured by the frame. */
export type Extras = { auto?: number; full?: number };
export type Resolved = { value: HandleValue; css: string; label: string };

/** A step takes the handle over within this many pixels on the screen. */
export const MAGNET = 6;

/** What can hold a handle: the kit's scale, and for a width also `auto` and `100%`. */
export function candidatesFor(property: string, scales: Scales, extras: Extras = {}): Candidate[] {
  const sized = property === 'width' || property === 'height';
  const candidates = (sized ? scales.size : scales.space).map(
    (step): Candidate => ({ value: { token: step.var }, px: step.px, label: step.name }),
  );
  if (property !== 'width') return candidates;
  if (extras.auto !== undefined) {
    candidates.push({ value: { raw: 'auto' }, px: extras.auto, label: 'auto' });
  }
  if (extras.full !== undefined) {
    candidates.push({ value: { raw: '100%' }, px: extras.full, label: '100%' });
  }
  return candidates;
}

/**
 * The candidate nearest to `px` among those at most `reach` from it, in the element's pixels; the
 * earlier one of two equally near. `undefined` when none is that near.
 */
export function snapTo(
  px: number,
  candidates: readonly Candidate[],
  reach: number = Number.POSITIVE_INFINITY,
): Candidate | undefined {
  let best: Candidate | undefined;
  for (const candidate of candidates) {
    const far = Math.abs(candidate.px - px);
    if (far > reach) continue;
    if (!best || far < Math.abs(best.px - px)) best = candidate;
  }
  return best;
}

/**
 * The value a handle at `px` stands for. A candidate within `reach` holds it: the label says its
 * name and its pixels, and a step is written as its token. Else, and always with Shift, it is the
 * pixels themselves, a value off the kit.
 */
export function resolve(
  px: number,
  shift: boolean,
  candidates: readonly Candidate[],
  reach: number = MAGNET,
): Resolved {
  const held = shift ? undefined : snapTo(px, candidates, reach);
  if (!held) {
    const raw = `${Math.round(Math.max(0, px))}px`;
    return { value: { raw }, css: raw, label: raw };
  }
  const label = `${held.label} · ${Math.round(held.px)}px`;
  if ('raw' in held.value) return { value: held.value, css: held.value.raw, label };
  return { value: held.value, css: `var(${held.value.token})`, label };
}

/**
 * How far the magnet reaches for `property`, in the element's pixels. `scale`: frame pixels per
 * pixel on the screen. A property a kit prop covers (`stepped`) has no value between two steps,
 * so the nearest step holds it wherever the pointer is.
 */
export function reachOf(property: string, stepped: ReadonlySet<string>, scale = 1): number {
  return stepped.has(property) ? Number.POSITIVE_INFINITY : MAGNET * scale;
}

/** The properties a handle changes: the corner changes two. */
export function tracksOf(spot: Pick<Spot, 'kind' | 'axis' | 'sign'>): Track[] {
  if (spot.kind === 'size' || spot.axis === 'both') {
    return [
      { property: 'width', axis: 'x', sign: 1 },
      { property: 'height', axis: 'y', sign: 1 },
    ];
  }
  return [{ property: spot.kind, axis: spot.axis, sign: spot.sign }];
}

/** With Alt a padding handle moves both sides of its axis together. */
export function propertyOf(property: string, alt: boolean): string {
  if (!alt) return property;
  if (property === 'padding-top' || property === 'padding-bottom') return 'padding-block';
  if (property === 'padding-left' || property === 'padding-right') return 'padding-inline';
  return property;
}

/** The value in pixels after the pointer went from `from` to `to`; never under zero. */
export function pxAfter(start: number, track: Track, from: Point, to: Point): number {
  const moved = track.axis === 'x' ? to.x - from.x : to.y - from.y;
  return Math.max(0, start + track.sign * moved);
}
