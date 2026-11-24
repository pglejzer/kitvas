// The canvas zoom's rules (plan 15, task B), pure so they are tested without a DOM: the range, the
// steps of the buttons and the wheel, the typed percent, Fit, where the cards sit in the canvas,
// and the scroll that keeps a point still.
//
// The cards live in one "world" that is scaled as a whole; `canvas.ts` applies what these say.

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 4;

/** The stops of the − and + buttons. */
const LADDER = [0.1, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4] as const;

export type Size = { width: number; height: number };
export type Point = { x: number; y: number };
export type Box = Point & Size;

/**
 * The room kept free around the cards, in page pixels. The bottom is deeper: the dock floats
 * there and must not cover a fitted card.
 */
export type Pad = { x: number; top: number; bottom: number };
export const PAD: Pad = { x: 32, top: 32, bottom: 96 };

/**
 * A zoom inside the range; a bad number is 100 %. Kept to a hundredth of a percent, so the small
 * steps of a trackpad pinch add up even at 10 %.
 */
export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return 1;
  return Math.round(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom)) * 10_000) / 10_000;
}

/** The next stop in `direction`: 100 % up is 125 %, 110 % up is 125 %, 110 % down is 100 %. */
export function stepZoom(zoom: number, direction: 1 | -1): number {
  const at = clampZoom(zoom);
  if (direction === 1) return LADDER.find((stop) => stop > at + 1e-6) ?? MAX_ZOOM;
  return [...LADDER].reverse().find((stop) => stop < at - 1e-6) ?? MIN_ZOOM;
}

/** The zoom after a Ctrl+wheel or pinch of `deltaY` pixels: a pinch sends many small steps. */
export function wheelZoom(zoom: number, deltaY: number): number {
  if (!Number.isFinite(deltaY)) return clampZoom(zoom);
  return clampZoom(zoom * Math.exp(-deltaY * 0.002));
}

/** A wheel's `deltaY` in pixels: a mouse may report lines (mode 1) or pages (mode 2). */
export function wheelPixels(deltaY: number, deltaMode: number): number {
  if (deltaMode === 1) return deltaY * 16;
  if (deltaMode === 2) return deltaY * 400;
  return deltaY;
}

/** What the strip shows: whole percents. */
export const percentOf = (zoom: number): string => `${Math.round(zoom * 100)}%`;

/**
 * The zoom a person typed: "150", "150%", "150 %" or "62.5"; a comma works as the decimal point.
 * Out of range it is cut to the range; `null` for anything that is no number.
 */
export function parsePercent(text: string): number | null {
  const match = /^\s*([0-9]{1,4}(?:[.,][0-9]{1,2})?)\s*%?\s*$/.exec(text);
  if (!match?.[1]) return null;
  const percent = Number(match[1].replace(',', '.'));
  return Number.isFinite(percent) && percent > 0 ? clampZoom(percent / 100) : null;
}

/**
 * Fit: the zoom at which the whole world (every card) shows inside the room, rounded down to a
 * whole percent so it never overflows by rounding. Never above 100 %: a small card stays sharp.
 * 100 % while a size is not known yet.
 */
export function fitZoom(room: Size, world: Size, pad: Pad = PAD): number {
  const wide = room.width - 2 * pad.x;
  const high = room.height - pad.top - pad.bottom;
  if (!(world.width > 0) || !(world.height > 0) || !(room.width > 0) || !(room.height > 0)) {
    return 1;
  }
  const ratio = Math.min(wide / world.width, high / world.height);
  if (!(ratio > 0)) return MIN_ZOOM;
  return clampZoom(Math.min(1, Math.floor(ratio * 100) / 100));
}

/**
 * Where the scaled world sits: `width` and `height` are what the scroller's content needs (the
 * world and the room around it), `left` and `top` the world's corner inside that content.
 * `centred`: the world fits the room's width, so it sits in the middle and grows to both sides.
 */
export type Placement = Size & { left: number; top: number; centred: boolean };

export function placeWorld(room: Size, world: Size, zoom: number, pad: Pad = PAD): Placement {
  const wide = world.width * zoom;
  const high = world.height * zoom;
  const width = Math.ceil(wide + 2 * pad.x);
  const height = Math.ceil(high + pad.top + pad.bottom);
  const left = Math.round((Math.max(room.width, width) - wide) / 2);
  // Above the dock's room when there is space; from the top when the world is taller.
  const free = room.height - height;
  const top = free > 0 ? Math.round(pad.top + free / 2) : pad.top;
  return { width, height, left, top, centred: width <= room.width };
}

/** One axis of a view of the world: its scale and where the world starts in the content. */
export type Axis = { zoom: number; offset: number };

/**
 * The scroll that keeps the world point under `pointer` (pixels from the scroller's edge) still
 * while the view goes `from` → `to`. The browser cuts it to what can be scrolled.
 */
export function anchorScroll(scroll: number, pointer: number, from: Axis, to: Axis): number {
  const scale = from.zoom > 0 ? from.zoom : 1;
  const at = (scroll + pointer - from.offset) / scale;
  return Math.max(0, at * to.zoom + to.offset - pointer);
}

/** The scroll that puts the world coordinate `centre` in the middle of a room `room` long. */
export function centreScroll(centre: number, axis: Axis, room: number): number {
  return Math.max(0, centre * axis.zoom + axis.offset - room / 2);
}

/** How much of the room a selection fills after "zoom to selection". */
const SELECTION_FILL = 0.8;

/** The zoom at which `box` fills most of the room; `null` for a box without a size. */
export function selectionZoom(room: Size, box: Size): number | null {
  const ratios: number[] = [];
  if (box.width > 0) ratios.push((room.width * SELECTION_FILL) / box.width);
  if (box.height > 0) ratios.push((room.height * SELECTION_FILL) / box.height);
  if (ratios.length === 0 || !(room.width > 0) || !(room.height > 0)) return null;
  return clampZoom(Math.floor(Math.min(...ratios) * 100) / 100);
}

/**
 * A point of a frame's own viewport (CSS pixels, as the frame reports it) in page pixels.
 * `frame` is the corner of the frame's content on the page; the page draws it scaled by `zoom`.
 */
export function fromFramePoint(
  point: Point,
  frame: { left: number; top: number },
  zoom: number,
): Point {
  const scale = zoom > 0 && Number.isFinite(zoom) ? zoom : 1;
  return { x: frame.left + point.x * scale, y: frame.top + point.y * scale };
}
