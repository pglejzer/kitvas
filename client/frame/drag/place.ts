// Where the marks go in the overlay. No DOM here: boxes in page coordinates come in, positions
// inside the overlay go out. Nothing is placed past the page's width, so marks never add a
// horizontal scroll bar to the prototype.

/** The size of a dot: 22 px, a round dot for one or two characters. */
export const DOT = 22;
/** Between two dots of one element. */
const GAP = 2;

export type Point = { left: number; top: number };
/** A box in page coordinates: viewport box plus scroll. */
export type Rect = { left: number; top: number; width: number; height: number };

export type DotsInput = {
  element: Rect;
  /** The width of each dot of this element, in the order they are read, left to right. */
  widths: number[];
  /** The overlay's own top-left corner, in page coordinates. */
  host: Point;
  /** The page's width without its scroll bar. */
  pageWidth: number;
};

/**
 * The dots of one element as one row read left to right ("1 3", not "3 1"). The row ends where a
 * single dot centred on the element's top-right corner would end, so one dot sits on the corner.
 * The row is moved left to stay inside the page and down to stay below its top.
 */
export function placeDots({ element, widths, host, pageWidth }: DotsInput): Point[] {
  const gaps = GAP * Math.max(0, widths.length - 1);
  const total = widths.reduce((sum, width) => sum + width, gaps);
  const corner = element.left + element.width + DOT / 2;
  const right = Math.min(Math.max(corner, total), pageWidth);
  const top = Math.max(0, element.top - DOT / 2);
  const points: Point[] = [];
  let edge = right - total;
  for (const width of widths) {
    points.push({ left: edge - host.left, top: top - host.top });
    edge += width + GAP;
  }
  return points;
}

/**
 * The box an outline is drawn around: the element's own box, cut to the page's width.
 * `undefined` when nothing of it is on the page.
 */
export function placeRing(element: Rect, host: Point, pageWidth: number): Rect | undefined {
  const left = Math.max(0, element.left);
  const top = Math.max(0, element.top);
  const right = Math.min(pageWidth, element.left + element.width);
  const bottom = element.top + element.height;
  if (right - left < 1 || bottom - top < 1) return undefined;
  const corner = { left: left - host.left, top: top - host.top };
  return { ...corner, width: right - left, height: bottom - top };
}
