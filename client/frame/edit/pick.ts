// What a click in edit mode picks (plan 13; plan 19, task 1): the nearest marked element around the
// click's target, with the protocol's own check on its id. And the one press edit mode leaves alone:
// a press on a lens pin (spec goal 9) belongs to the pin, whose overlay (`../lens/pins.ts`) reports
// its click itself; outside that overlay's closed shadow root its host is the event's target. Pure:
// plain objects stand in for elements in the tests. Moved out of `edit.ts`, which keeps them
// importable from there.

import { parseEditFrame } from '../../channel/edit-protocol.ts';
import { isLensHost } from '../lens/pins.ts';

export const MARKED = '[data-ks]';

/** As much of an element as picking needs. */
export type TargetLike = {
  closest(selector: string): { getAttribute(name: string): string | null } | null;
};
export type Picked = { id: string | null; add: boolean; double: boolean };

/** Stopped while edit mode is on, so no link, button or handler of the page acts. */
export const POINTER_EVENTS = [
  'pointerdown',
  'mousedown',
  'pointerup',
  'mouseup',
  'click',
  'dblclick',
  'auxclick',
] as const;

/** The id of the nearest marked element around `target`; `null` outside any, or for an odd id. */
export function idOf(target: TargetLike | null): string | null {
  const id = target?.closest(MARKED)?.getAttribute('data-ks') ?? null;
  // The protocol's own check: an id the studio would refuse is no id.
  if (id === null || !parseEditFrame({ type: 'hovered', id }, 'probe')) return null;
  return id;
}

/**
 * What a click on `target` picks: `add` (`addsToSelection`) adds to the selection, a double click
 * asks for more. A double click with `add` only does what its first click did.
 */
export function pickOf(target: TargetLike | null, add: boolean, double: boolean): Picked {
  return { id: idOf(target), add, double };
}

/**
 * Whether edit mode leaves a pointer event to someone else: one whose target is the lens pins' host
 * is a press on a pin. It picks nothing, deselects nothing, starts no inline edit and shows no
 * hover; the pins' overlay stops it before edit mode hears it, and this holds should it get here.
 */
export const leavesPointer = (target: unknown): boolean => isLensHost(target);
