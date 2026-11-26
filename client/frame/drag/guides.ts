// Distance guides (spec 4b, decision 12; plan 14, task C3): the distance between the selected
// element and the one under the pointer, in px and as the nearest step of the kit's spacing
// scale. Distances are measured from the elements' boxes: `distances`, `nearestStep` and `labelOf`
// are pure. The lines and labels sit in an overlay of the frame's own at the end of `body`, inside
// a closed shadow root like the marks: nothing of the page is changed, and the overlay takes no
// pointer events. Where the handles go on an element is in `spots.ts`.

import type { ScaleStep } from '../../channel/structure-protocol.ts';
import { elementsWith } from '../edit/tree.ts';
import { boxOf } from '../page/rect.ts';
import { toned } from '../tones/tones.ts';
import type { Box, Point } from './slots.ts';

const MARKED = '[data-ks]';
/** A shorter distance is not drawn: the boxes touch. */
const MIN_DISTANCE = 0.5;

/** One measured distance: a straight line from `from` to `to`, `px` long, along `axis`. */
export type Measure = { axis: 'x' | 'y'; px: number; from: Point; to: Point };

/** The step whose size is nearest to `px`; the earlier one of two equally near. */
export function nearestStep(px: number, steps: readonly ScaleStep[]): ScaleStep | undefined {
  let best: ScaleStep | undefined;
  for (const step of steps) {
    if (!best || Math.abs(step.px - px) < Math.abs(best.px - px)) best = step;
  }
  return best;
}

/** What a guide's label says: the pixels, then the nearest step's name when there is a scale. */
export function labelOf(px: number, steps: readonly ScaleStep[]): string {
  const step = nearestStep(px, steps);
  const pixels = `${Math.round(px)}px`;
  return step ? `${pixels} · ${step.name}` : pixels;
}

const apart = (a0: number, a1: number, b0: number, b1: number): boolean => b0 >= a1 || b1 <= a0;

/**
 * The stretches to measure on one axis. Boxes apart on it: the one gap between their facing
 * edges. Boxes that overlap on both axes (`inside`: one in the other, or crossing): between
 * their start edges and between their end edges, which for a child in its parent are its two
 * insets. Boxes side by side on the other axis only: nothing on this one.
 */
function stretches(
  a0: number,
  a1: number,
  b0: number,
  b1: number,
  inside: boolean,
): [number, number][] {
  if (b0 >= a1) return [[a1, b0]];
  if (b1 <= a0) return [[b1, a0]];
  if (!inside) return [];
  return [
    [Math.min(a0, b0), Math.max(a0, b0)],
    [Math.min(a1, b1), Math.max(a1, b1)],
  ];
}

/** Where a line runs on the other axis: through the part both boxes share, else `a`'s middle. */
function crossing(a0: number, a1: number, b0: number, b1: number): number {
  const low = Math.max(a0, b0);
  const high = Math.min(a1, b1);
  return high > low ? (low + high) / 2 : (a0 + a1) / 2;
}

const rounded = (value: number): number => Math.round(value * 100) / 100;

/**
 * The distances between two boxes, `from` the selected one: the gap to the side, above or below
 * when they are apart (both for a diagonal), the insets on every side when one holds or crosses
 * the other. Touching edges give nothing.
 */
export function distances(from: Box, to: Box): Measure[] {
  const measures: Measure[] = [];
  const [aRight, aBottom] = [from.left + from.width, from.top + from.height];
  const [bRight, bBottom] = [to.left + to.width, to.top + to.height];
  const inside =
    !apart(from.left, aRight, to.left, bRight) && !apart(from.top, aBottom, to.top, bBottom);
  const y = crossing(from.top, aBottom, to.top, bBottom);
  for (const [start, end] of stretches(from.left, aRight, to.left, bRight, inside)) {
    if (end - start < MIN_DISTANCE) continue;
    measures.push({
      axis: 'x',
      px: rounded(end - start),
      from: { x: start, y },
      to: { x: end, y },
    });
  }
  const x = crossing(from.left, aRight, to.left, bRight);
  for (const [start, end] of stretches(from.top, aBottom, to.top, bBottom, inside)) {
    if (end - start < MIN_DISTANCE) continue;
    measures.push({
      axis: 'y',
      px: rounded(end - start),
      from: { x, y: start },
      to: { x, y: end },
    });
  }
  return measures;
}

// The DOM part: an overlay like the marks', shared with the handles.

export type Overlay = {
  host: HTMLElement;
  root: HTMLElement;
  /** The overlay's own top-left corner in page coordinates (viewport plus scroll). */
  origin(): Point;
  remove(): void;
};

/** An overlay at the end of `body` in a closed shadow root; `tag` names its host element. */
export function createOverlay(tag: string, sheet: string, zIndex: number): Overlay {
  // Fixed over the viewport and clipped to it: a handle on the right edge of a full-width element
  // would otherwise widen the page and give the prototype a scrollbar it does not have. Every
  // place is measured from `origin()`, and the parts are placed again on scroll.
  const rules = [
    'all: initial',
    'position: fixed',
    'left: 0',
    'top: 0',
    'right: 0',
    'bottom: 0',
    'overflow: hidden',
    'pointer-events: none',
    `z-index: ${zIndex}`,
  ];
  const host = document.createElement(tag);
  host.setAttribute('aria-hidden', 'true');
  // Inline and important, so no rule of the prototype moves or hides the overlay itself.
  host.style.cssText = rules.map((rule) => `${rule} !important;`).join(' ');
  toned(host);
  const shadow = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = sheet;
  // `kitvas-` tags all the way down: the drag tells the frame's own elements by that name.
  const root = document.createElement('kitvas-layer');
  shadow.append(style, root);
  document.body.append(host);
  return {
    host,
    root,
    origin() {
      const rect = host.getBoundingClientRect();
      return { x: rect.left + scrollX, y: rect.top + scrollY };
    },
    remove: () => host.remove(),
  };
}

// The studio's selection colour (`toned`, custom properties reach into a shadow root); the system
// colour stands in until the studio has said its tones.
const LINE = 'var(--kv-select, CanvasText)';
const SHEET = `
.line, .label { position: absolute; left: 0; top: 0; pointer-events: none; }
.line { background: ${LINE}; }
.label {
  transform: translate(-50%, -50%); padding: 2px 5px; border-radius: 3px; white-space: nowrap;
  font: 600 11px/1.2 system-ui, -apple-system, "Segoe UI", sans-serif;
  font-variant-numeric: tabular-nums; letter-spacing: 0;
  background: ${LINE}; color: var(--kv-on-select, Canvas);
}
.off { display: none; }
@media (forced-colors: active) {
  .line { background: CanvasText; }
  .label { background: Canvas; color: CanvasText; border: 1px solid CanvasText; }
}
`;
const TAG = 'kitvas-guides';
const Z_INDEX = 2147483645;
/** Two insets on each axis at most. */
const MAX_MEASURES = 4;

export type Guides = {
  /**
   * Shows the distances between the first element with `id` and the element under `point`
   * (frame pixels), labelled with the nearest step of `space`. Nothing under the pointer, or
   * only the element itself: the guides go.
   */
  measure(id: string, point: Point, space: readonly ScaleStep[]): void;
  hide(): void;
  /**
   * Frame pixels per pixel on the screen (the inverse of the canvas zoom): the lines and the
   * labels keep their size on the screen.
   */
  scale(value: number): void;
  /** Removes the overlay. A later `measure` makes it again. */
  dispose(): void;
};

/** The nearest marked element under the point that is not `selected` itself. */
function otherAt(point: Point, selected: Element): Element | undefined {
  for (const element of document.elementsFromPoint(point.x, point.y)) {
    const marked = element.closest(MARKED);
    if (marked && marked !== selected) return marked;
  }
  return undefined;
}

type Part = { line: HTMLElement; label: HTMLElement };

/** The guides of a frame. A move drag and Alt+hover call `measure` on every pointer move. */
export function createGuides(): Guides {
  let overlay: Overlay | undefined;
  let parts: Part[] = [];
  let zoom = 1;

  function partsOf(layer: Overlay): Part[] {
    while (parts.length < MAX_MEASURES) {
      const line = document.createElement('kitvas-guide');
      line.className = 'line off';
      const label = document.createElement('kitvas-guide');
      label.className = 'label off';
      layer.root.append(line, label);
      parts.push({ line, label });
    }
    return parts;
  }

  function draw(measures: Measure[], space: readonly ScaleStep[]): void {
    overlay ??= createOverlay(TAG, SHEET, Z_INDEX);
    const origin = overlay.origin();
    // Viewport pixels to the overlay's own: plus the scroll, minus where the overlay starts.
    const shiftX = scrollX - origin.x;
    const shiftY = scrollY - origin.y;
    for (const [index, { line, label }] of partsOf(overlay).entries()) {
      const measure = measures[index];
      line.classList.toggle('off', !measure);
      label.classList.toggle('off', !measure);
      if (!measure) continue;
      const along = measure.axis === 'x';
      line.style.left = `${measure.from.x + shiftX}px`;
      line.style.top = `${measure.from.y + shiftY}px`;
      line.style.width = `${along ? measure.to.x - measure.from.x : zoom}px`;
      line.style.height = `${along ? zoom : measure.to.y - measure.from.y}px`;
      label.style.left = `${(measure.from.x + measure.to.x) / 2 + shiftX}px`;
      label.style.top = `${(measure.from.y + measure.to.y) / 2 + shiftY}px`;
      // Of the overlay's own label, never of a page element: it keeps its size on the screen.
      label.style.transform = `translate(-50%, -50%) scale(${zoom})`;
      // Text only: a step's name is never read as markup.
      label.textContent = labelOf(measure.px, space);
    }
  }

  function hide(): void {
    for (const { line, label } of parts) {
      line.classList.add('off');
      label.classList.add('off');
    }
  }

  return {
    measure(id, point, space) {
      const selected = elementsWith(new Set([id]))[0];
      const other = selected ? otherAt(point, selected) : undefined;
      if (!selected || !other) {
        hide();
        return;
      }
      draw(distances(boxOf(selected), boxOf(other)).slice(0, MAX_MEASURES), space);
    },
    hide,
    scale(value) {
      zoom = value > 0 && Number.isFinite(value) ? value : 1;
    },
    dispose() {
      overlay?.remove();
      overlay = undefined;
      parts = [];
    },
  };
}
