// Scrubbing (plan 15, task C; spec goal 8): drag a number row's label left or right to step
// through the kit's scale; with Shift the drag moves in raw px, which is off-kit. The value shows
// on the label while the pointer moves and is written once, when it is let go; Escape cancels.
// The steps are pure; `attachScrub` is the thin DOM over them.

import type { StyleValue, TokenOption } from '../../../../../src/edit/index.ts';
import { indexOnScale, stepToken, varOf } from '../values/steps.ts';
import { lengthPx } from '../values/units.ts';

/** Pointer px per step of the scale, and per px with Shift. */
export const SCRUB_PX = 8;

/** Whole steps for a drag of `dx` px: right is up the scale, left is down. */
export const scrubSteps = (dx: number): number => Math.trunc(dx / SCRUB_PX);

/** The px of a value: a length, or the length of the token a `var()` names. */
function pxOf(tokens: readonly TokenOption[], value: string | null): number | null {
  if (value === null) return null;
  if (varOf(value) !== null) {
    const token = tokens[indexOnScale(tokens, value)];
    return token ? lengthPx(token.css) : null;
  }
  return lengthPx(value);
}

/**
 * Where a scrub of `steps` from `start` lands. Along the scale it moves one token per step and
 * stops at the ends; `raw` moves one px per step from the start's px (0 when it has none), never
 * under `min`. `null` for no move, or a scale with nowhere to go.
 */
export function scrubValue(options: {
  tokens: readonly TokenOption[];
  start: string | null;
  steps: number;
  raw: boolean;
  min: number | null;
}): StyleValue | null {
  const { tokens, start, steps } = options;
  if (steps === 0) return null;
  if (options.raw) {
    const from = pxOf(tokens, start) ?? 0;
    const to = options.min === null ? from + steps : Math.max(options.min, from + steps);
    return { raw: `${Math.round(to)}px` };
  }
  const direction = steps > 0 ? 1 : -1;
  let current = start;
  let landed: TokenOption | null = null;
  for (let step = 0; step < Math.abs(steps); step += 1) {
    const next = stepToken(tokens, current, direction, false);
    if (next === null || next.var === landed?.var) break;
    landed = next;
    current = next.var;
  }
  return landed === null ? null : { token: landed.var };
}

/** How a scrub value shows on the label while the pointer moves. */
export function scrubText(tokens: readonly TokenOption[], value: StyleValue): string {
  if ('raw' in value) return value.raw;
  return tokens.find((token) => token.var === value.token)?.path ?? value.token;
}

/**
 * Makes `label` scrub: a press and a drag step the value, the release writes it once. The label
 * keeps its text; the moving value shows in `data-scrub`, which the skin draws over the label.
 */
export function attachScrub(
  label: HTMLElement,
  options: {
    tokens: readonly TokenOption[];
    min: number | null;
    /** Shift moves in raw px: only a length row takes px. */
    rawPx: boolean;
    getStart(): string | null;
    onScrub(value: StyleValue): void;
  },
): void {
  label.classList.add('props-scrubber');
  let drag: { pointer: number; x: number; value: StyleValue | null } | null = null;
  // Listened to only while a drag runs: the panel rebuilds its rows, and a listener left on the
  // document by each one would pile up.
  const onKey = (event: KeyboardEvent): void => {
    if (event.key === 'Escape' && drag !== null) stop(false);
  };
  function stop(write: boolean): void {
    const value = drag?.value ?? null;
    drag = null;
    delete label.dataset.scrub;
    document.removeEventListener('keydown', onKey);
    if (write && value !== null) options.onScrub(value);
  }
  label.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    drag = { pointer: event.pointerId, x: event.clientX, value: null };
    label.setPointerCapture(event.pointerId);
    document.addEventListener('keydown', onKey);
  });
  label.addEventListener('pointermove', (event) => {
    if (drag?.pointer !== event.pointerId) return;
    const steps = scrubSteps(event.clientX - drag.x);
    const value = scrubValue({
      tokens: options.tokens,
      start: options.getStart(),
      steps,
      raw: options.rawPx && event.shiftKey,
      min: options.min,
    });
    drag.value = value;
    if (value === null) delete label.dataset.scrub;
    else label.dataset.scrub = scrubText(options.tokens, value);
  });
  label.addEventListener('pointerup', (event) => {
    if (drag?.pointer === event.pointerId) stop(true);
  });
  label.addEventListener('pointercancel', () => stop(false));
  label.addEventListener('lostpointercapture', () => {
    if (drag !== null) stop(false);
  });
}
