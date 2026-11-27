// The canvas width's rules (plan 15, task B), pure so they are tested without a DOM. A draft is
// shown at one of three presets (the widths the checks run at, so their marks show) or at any
// other width from 320 to 2560, where the marks are hidden. The presets, the range and the sizes
// of the width pill's menu are the server's own (`src/studio/views/widths.ts`, ADR 0080).

import { MAX_VIEW, MIN_VIEW, SIZES, WIDTHS, type Width } from '../../../src/studio/views/widths.ts';

export { frameHeight, MAX_VIEW, MIN_VIEW, SIZES } from '../../../src/studio/views/widths.ts';

/** The three presets, phone first: the widths the checks run at. */
export const PRESETS: readonly Width[] = WIDTHS;

/** The width a menu row stands for (`data-dock-size`); `null` for anything that is not a size. */
export function sizeOf(text: string | null | undefined): number | null {
  const width = parseView(text);
  return width !== null && SIZES.some((size) => size.width === width) ? width : null;
}

/** A drag that ends this close to a preset, in pixels of width, lands on it. */
export const SNAP = 8;

/**
 * What the canvas shows: `width` is the preset the checks and marks belong to, `view` any other
 * width shown instead (`null` while a preset shows).
 */
export type Shown = { width: Width; view: number | null };

export const shownWidth = (shown: Shown): number => shown.view ?? shown.width;

export const sameShown = (a: Shown, b: Shown): boolean => a.width === b.width && a.view === b.view;

export function presetOf(width: number): Width | null {
  return PRESETS.find((preset) => preset === width) ?? null;
}

/** A whole width inside 320 to 2560; a bad number is the narrowest. */
export function clampView(width: number): number {
  if (!Number.isFinite(width)) return MIN_VIEW;
  return Math.min(MAX_VIEW, Math.max(MIN_VIEW, Math.round(width)));
}

/** A typed or stored width: digits only, cut to the range; `null` for anything else. */
export function parseView(text: string | null | undefined): number | null {
  const trimmed = (text ?? '').trim();
  return /^[0-9]{1,5}$/.test(trimmed) ? clampView(Number(trimmed)) : null;
}

/** The view after `asked` pixels are chosen: a preset is itself, any other width is a `view`. */
export function chooseWidth(current: Shown, asked: number): Shown {
  const width = clampView(asked);
  const preset = presetOf(width);
  return preset === null ? { width: current.width, view: width } : { width: preset, view: null };
}

/** What a page starts with: `data-width` and `data-view` (or `?view=`); the phone by default. */
export function readShown(width: string | undefined, view: string | null | undefined): Shown {
  const preset = presetOf(Number(width)) ?? PRESETS[0] ?? 390;
  const base: Shown = { width: preset, view: null };
  const asked = parseView(view);
  return asked === null ? base : chooseWidth(base, asked);
}

/** Arrow keys: 1 px, with Shift 10 px. */
export function stepView(width: number, direction: 1 | -1, big: boolean): number {
  return clampView(width + direction * (big ? 10 : 1));
}

/** The preset within `SNAP` pixels of `width`, else `width` itself. */
export function snapToPreset(width: number, within: number = SNAP): number {
  return PRESETS.find((preset) => Math.abs(preset - width) <= within) ?? width;
}

/**
 * The width while the handle on the card's right edge is dragged `dx` page pixels from `start`.
 * The card is drawn scaled by `zoom`. A centred card grows to both sides, so the width moves two
 * pixels for each pixel of the pointer and the edge stays under it.
 */
export function dragWidth(start: number, dx: number, zoom: number, centred: boolean): number {
  const scale = zoom > 0 && Number.isFinite(zoom) ? zoom : 1;
  return clampView(start + (dx * (centred ? 2 : 1)) / scale);
}

/**
 * The address of a view at the width shown: `width` names the preset; `view` is there only for
 * another width. Everything else in the address stays, so it serves the page's own address and
 * the links to its other states alike.
 */
export function widthAddress(href: string, shown: Shown): string {
  const url = new URL(href);
  url.searchParams.set('width', String(shown.width));
  if (shown.view === null) url.searchParams.delete('view');
  else url.searchParams.set('view', String(shown.view));
  return url.href;
}
