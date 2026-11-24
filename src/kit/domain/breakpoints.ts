// The widths from which a kit's layout changes (spec 4c, goal 1): an edit made at one of them is
// written for that width and up.

import type { Kit } from './contract.ts';

/** The breakpoints of a kit that declares none: the studio's 768 and 1280 preset widths. */
export const DEFAULT_BREAKPOINTS: readonly number[] = [768, 1280];

/** The kit's breakpoints, ascending and without repeats. */
export function kitBreakpoints(kit: Pick<Kit, 'breakpoints'>): number[] {
  const list = kit.breakpoints ?? DEFAULT_BREAKPOINTS;
  return [...new Set(list)].sort((a, b) => a - b);
}
