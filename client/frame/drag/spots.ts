// Where the handles of `handles.ts` go on an element (ADR 0059): pure geometry over boxes in the
// frame's viewport pixels. A handle is a small bar that is drawn and a larger zone around it that
// takes the pointer; both keep their size on the screen at any canvas zoom, so every length here
// is in screen pixels times `scale` (frame pixels per screen pixel, the inverse of the zoom).

import type { Box, Point } from './slots.ts';

export type Side = 'top' | 'right' | 'bottom' | 'left';
export type HandleKind = 'width' | 'height' | 'size' | `padding-${Side}` | 'gap';
/**
 * One handle: the bar that is drawn (`box`), the zone that takes the pointer (`hit`), and how a
 * pointer movement changes its value.
 */
export type Spot = {
  kind: HandleKind;
  box: Box;
  hit: Box;
  axis: 'x' | 'y' | 'both';
  sign: 1 | -1;
};
export type SpotsInput = {
  box: Box;
  padding: Record<Side, number>;
  display: string;
  /** The boxes of the element's children, in document order. */
  children: readonly Box[];
  /** Frame pixels per pixel on the screen; 1 when left out. */
  scale?: number;
};

/** A bar on an edge or in a gap, in pixels on the screen: thin across, long along the edge. */
const THICK = 4;
const LONG = 18;
/** A padding bar is shorter than the size bar of the same edge. */
const SHORT = 12;
const CORNER = 8;
/** The zone that takes the pointer is this much larger than its bar, and never smaller across. */
const HIT_MORE = 6;
const HIT_MIN = 12;
/** A padding handle stays this far inside the edge, clear of the size handle's zone on it. */
const INSET = 14;
/** Smaller elements get no padding handles on that axis: they would cover the element. */
const MIN_HEIGHT = 48;
const MIN_WIDTH = 64;
export const MAX_GAPS = 24;
/** Rounding slack when asking whether one child starts where the other ends. */
const SLACK = 0.5;

/** Gap handles only on a flex or grid container with two or more children. */
export function showsGap(display: string, children: number): boolean {
  return children >= 2 && /^(inline-)?(flex|grid)$/.test(display.trim());
}

const centred = (x: number, y: number, width: number, height: number): Box => ({
  left: x - width / 2,
  top: y - height / 2,
  width,
  height,
});

/** The zone around a bar: larger on every side, and wide enough to press at any zoom. */
export function hitOf(bar: Box, scale = 1): Box {
  const width = Math.max(bar.width + HIT_MORE * scale, HIT_MIN * scale);
  const height = Math.max(bar.height + HIT_MORE * scale, HIT_MIN * scale);
  return centred(bar.left + bar.width / 2, bar.top + bar.height / 2, width, height);
}

function spot(
  kind: HandleKind,
  box: Box,
  axis: Spot['axis'],
  sign: Spot['sign'],
  scale: number,
): Spot {
  return { kind, box, hit: hitOf(box, scale), axis, sign };
}

/** The handle between two neighbours, when one follows the other along a row or a column. */
function between(a: Box, b: Box, scale: number): Spot | undefined {
  const [aRight, aBottom] = [a.left + a.width, a.top + a.height];
  const [bRight, bBottom] = [b.left + b.width, b.top + b.height];
  const shareY = Math.min(aBottom, bBottom) - Math.max(a.top, b.top);
  const shareX = Math.min(aRight, bRight) - Math.max(a.left, b.left);
  // `after`: `b` comes later along the axis; a reversed direction puts it before `a`.
  if (shareY > 0 && (b.left >= aRight - SLACK || bRight <= a.left + SLACK)) {
    const after = b.left >= aRight - SLACK;
    const x = after ? (aRight + b.left) / 2 : (bRight + a.left) / 2;
    const y = Math.max(a.top, b.top) + shareY / 2;
    const box = centred(x, y, THICK * scale, Math.min(LONG * scale, shareY));
    return spot('gap', box, 'x', after ? 1 : -1, scale);
  }
  if (shareX > 0 && (b.top >= aBottom - SLACK || bBottom <= a.top + SLACK)) {
    const after = b.top >= aBottom - SLACK;
    const x = Math.max(a.left, b.left) + shareX / 2;
    const y = after ? (aBottom + b.top) / 2 : (bBottom + a.top) / 2;
    const box = centred(x, y, Math.min(LONG * scale, shareX), THICK * scale);
    return spot('gap', box, 'y', after ? 1 : -1, scale);
  }
  // The end of one line and the start of the next: no gap to take hold of.
  return undefined;
}

/** A gap handle between each pair of neighbouring children that share a row or a column. */
export function gapSpots(children: readonly Box[], scale = 1): Spot[] {
  const spots: Spot[] = [];
  for (let index = 0; index + 1 < children.length && spots.length < MAX_GAPS; index += 1) {
    const [a, b] = [children[index], children[index + 1]];
    const found = a && b ? between(a, b, scale) : undefined;
    if (found) spots.push(found);
  }
  return spots;
}

/** Every handle of an element. The corner comes first, so it wins where zones meet. */
export function spotsFor({ box, padding, display, children, scale = 1 }: SpotsInput): Spot[] {
  const [right, bottom] = [box.left + box.width, box.top + box.height];
  const [x, y] = [box.left + box.width / 2, box.top + box.height / 2];
  const [thick, long, short] = [THICK * scale, LONG * scale, SHORT * scale];
  const inset = (side: Side): number => Math.max(padding[side] / 2, INSET * scale);
  const edge = centred(right, y, thick, Math.min(long, box.height));
  const base = centred(x, bottom, Math.min(long, box.width), thick);
  const corner = centred(right, bottom, CORNER * scale, CORNER * scale);
  const spots: Spot[] = [
    spot('size', corner, 'both', 1, scale),
    spot('width', edge, 'x', 1, scale),
    spot('height', base, 'y', 1, scale),
  ];
  // A padding grows when its handle moves into the element: down for the top, up for the bottom.
  if (box.height >= MIN_HEIGHT * scale) {
    const top = centred(x, box.top + inset('top'), short, thick);
    const low = centred(x, bottom - inset('bottom'), short, thick);
    spots.push(spot('padding-top', top, 'y', 1, scale));
    spots.push(spot('padding-bottom', low, 'y', -1, scale));
  }
  if (box.width >= MIN_WIDTH * scale) {
    const left = centred(box.left + inset('left'), y, thick, short);
    const far = centred(right - inset('right'), y, thick, short);
    spots.push(spot('padding-left', left, 'x', 1, scale));
    spots.push(spot('padding-right', far, 'x', -1, scale));
  }
  if (showsGap(display, children.length)) spots.push(...gapSpots(children, scale));
  return spots;
}

/**
 * The handles left when the element cannot take the `blocked` CSS properties: a handle whose
 * property is blocked is not drawn, and the corner goes with either of its two.
 */
export function allowedSpots(spots: readonly Spot[], blocked: ReadonlySet<string>): Spot[] {
  if (blocked.size === 0) return [...spots];
  return spots.filter(({ kind }) =>
    kind === 'size' ? !blocked.has('width') && !blocked.has('height') : !blocked.has(kind),
  );
}

/** The first handle whose zone holds the point. */
export function spotAt(point: Point, spots: readonly Spot[]): Spot | undefined {
  return spots.find(
    ({ hit }) =>
      point.x >= hit.left &&
      point.x <= hit.left + hit.width &&
      point.y >= hit.top &&
      point.y <= hit.top + hit.height,
  );
}
