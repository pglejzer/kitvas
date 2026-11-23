// The box a crop or a capture takes: the element's box widened by the reach of its shadow and
// clamped to the page. A reference cut out of a website (`kit scan`) and the rendered example it is
// compared with (`look`) are measured by this one rule, or their sizes would differ by the shadow.

/** How far an element's outer shadows paint beyond its box, per side, in whole CSS pixels. */
export type Reach = { top: number; right: number; bottom: number; left: number };
/** x, y, width, height in whole page pixels. */
export type Rect = [number, number, number, number];
/** A box as Playwright gives it, in CSS pixels. */
export type Box = { x: number; y: number; width: number; height: number };
export type PageSize = { width: number; height: number; scrollX: number; scrollY: number };

/** A shadow that reaches further than this is a glow around the page, not part of the component. */
export const REACH_MAX = 16;
export const NO_REACH: Reach = { top: 0, right: 0, bottom: 0, left: 0 };

/**
 * Runs in the page, on one element: offset plus blur plus spread of each outer shadow, the widest
 * per side, rounded up and at most `max`. Inset shadows paint inside the box and add nothing.
 */
export function shadowReach(element: Element, max: number): Reach {
  const value = getComputedStyle(element).boxShadow;
  const reach = { top: 0, right: 0, bottom: 0, left: 0 };
  if (!value || value === 'none') return reach;
  // A comma inside a colour, as in rgba(0, 0, 0, 0.2), does not start another shadow.
  const shadows: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === '(') depth += 1;
    else if (char === ')') depth -= 1;
    else if (char === ',' && depth === 0) {
      shadows.push(value.slice(start, index));
      start = index + 1;
    }
  }
  shadows.push(value.slice(start));
  for (const shadow of shadows) {
    if (/\binset\b/i.test(shadow)) continue;
    // The colour goes first, so the lengths left are x, y, blur and spread.
    const lengths = (
      shadow.replace(/[a-z-]+\([^)]*\)/gi, ' ').match(/-?\d*\.?\d+(?:e[+-]?\d+)?px/gi) ?? []
    ).map((length) => Number.parseFloat(length));
    const [x = 0, y = 0, blur = 0, spread = 0] = lengths;
    const grow = Math.max(0, blur) + spread;
    reach.top = Math.max(reach.top, grow - y);
    reach.right = Math.max(reach.right, grow + x);
    reach.bottom = Math.max(reach.bottom, grow + y);
    reach.left = Math.max(reach.left, grow - x);
  }
  const cap = (amount: number): number => Math.min(max, Math.max(0, Math.ceil(amount)));
  return {
    top: cap(reach.top),
    right: cap(reach.right),
    bottom: cap(reach.bottom),
    left: cap(reach.left),
  };
}

/** Runs in the page: the scrollable size of the document and how far it is scrolled. */
export function pageSize(): PageSize {
  const root = document.documentElement;
  const body = document.body;
  return {
    width: Math.max(root.scrollWidth, body ? body.scrollWidth : 0),
    height: Math.max(root.scrollHeight, body ? body.scrollHeight : 0),
    scrollX: window.scrollX,
    scrollY: window.scrollY,
  };
}

/** The box in whole pixels, each part rounded on its own, as the facts list it. */
export function roundBox(box: Box): Rect {
  return [Math.round(box.x), Math.round(box.y), Math.round(box.width), Math.round(box.height)];
}

/**
 * The element's box (page pixels) rounded, widened by its reach and clamped to the page; undefined
 * when the element has no size or nothing of it is on the page.
 */
export function widened(
  box: Box,
  reach: Reach,
  page: { width: number; height: number },
): Rect | undefined {
  const [x, y, width, height] = roundBox(box);
  if (width < 1 || height < 1) return undefined;
  const left = Math.max(0, x - reach.left);
  const top = Math.max(0, y - reach.top);
  const right = Math.min(Math.floor(page.width), x + width + reach.right);
  const bottom = Math.min(Math.floor(page.height), y + height + reach.bottom);
  return right > left && bottom > top ? [left, top, right - left, bottom - top] : undefined;
}
