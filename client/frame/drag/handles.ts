// Handles and distance guides on the selected element (ADR 0059): a size, padding or gap handle
// follows the pointer pixel by pixel, and a step of the kit's scale takes it over only when the
// value comes near it (`magnet.ts`); Shift switches that off. A handle previews on the element and
// posts `handle` while it moves and once with `done` when let go. Alt+hover, a handle drag and a
// move drag show the distance to the element under the pointer, in px and the nearest step.
//
// The handles sit in an overlay of the frame's own (a closed shadow root at the end of `body`),
// at one size on the screen whatever the canvas zoom is: a small bar that is drawn inside a larger
// zone that takes the pointer (`spots.ts`, read off the page by `measure.ts`). The only thing ever
// set on a page element is the inline preview of the dragged property, taken back before the
// release is posted; never a position, an offset or a transform.

import type { PreviewChange } from '../../channel/edit-protocol.ts';
import type {
  HandleValue,
  ScaleStep,
  StructureFrameMessage,
} from '../../channel/structure-protocol.ts';
import { createPreview } from '../edit/preview.ts';
import { elementsWith } from '../edit/tree.ts';
import { hold } from '../page/busy.ts';
import { createGuides, createOverlay, type Overlay } from './guides.ts';
import {
  type Candidate,
  candidatesFor,
  type Extras,
  propertyOf,
  pxAfter,
  reachOf,
  resolve,
  type Scales,
  type Track,
  tracksOf,
} from './magnet.ts';
import { aroundOf, px, readSpots } from './measure.ts';
import { boxOf } from './preview.ts';
import type { Box, Point } from './slots.ts';
import { allowedSpots, MAX_GAPS, type Spot, spotAt } from './spots.ts';

export type HandlesDeps = {
  post(message: StructureFrameMessage): void;
  channel: string;
  scales(): Scales;
};

export type Handles = {
  /** On only in edit mode with nothing else dragging; off removes every handle. */
  enable(on: boolean): void;
  /** The element the handles sit on; `null` or several selected: none. */
  show(id: string | null): void;
  /** Frame pixels per pixel on the screen: the inverse of the canvas zoom. */
  scale(value: number): void;
  /**
   * What the selected element takes: no handle is drawn for a `blocked` CSS property, and a
   * `stepped` one (a kit prop covers it) goes from step to step.
   */
  limit(blocked: readonly string[], stepped: readonly string[]): void;
};

/** The overlay's host element: a pointer event whose target it is belongs to a handle. */
export const HANDLES_HOST = 'kitvas-handles';

/** A press that moves less than this, in pixels on the screen, is no drag and writes nothing. */
const THRESHOLD = 3;
/** How far from the pointer the value label sits, in pixels on the screen. */
const LABEL_OFFSET = 14;
/** The shield and the label lie over every handle, however many there are. */
const ABOVE = MAX_GAPS + 16;

// Tones come from `toned` (`guides.ts`); system colours stand in before the studio's.
const FOCUS = 'var(--kv-select, Highlight)';
const SHEET = `
.handle, .bar, .value { position: absolute; left: 0; top: 0; box-sizing: border-box; }
.handle { pointer-events: auto; touch-action: none; }
.bar {
  pointer-events: none; border-style: solid; border-color: ${FOCUS};
  background: var(--kv-on-select, Canvas);
}
.handle[data-kind^="padding"] .bar, .handle[data-kind="gap"] .bar {
  background: ${FOCUS}; border-color: var(--kv-on-select, Canvas);
}
.shield {
  position: fixed; inset: 0; z-index: ${ABOVE}; pointer-events: auto; touch-action: none;
}
[data-axis="x"] { cursor: ew-resize; }
[data-axis="y"] { cursor: ns-resize; }
[data-axis="both"] { cursor: nwse-resize; }
.value {
  z-index: ${ABOVE + 1}; transform-origin: 0 0;
  pointer-events: none; padding: 2px 5px; border-radius: 3px; white-space: nowrap;
  font: 600 11px/1.2 system-ui, -apple-system, "Segoe UI", sans-serif;
  font-variant-numeric: tabular-nums; letter-spacing: 0;
  background: var(--kv-select, CanvasText); color: var(--kv-on-select, Canvas);
}
.off { display: none; }
@media (forced-colors: active) {
  .bar { background: Canvas; border-color: Highlight; }
  .value { background: Canvas; color: CanvasText; border: 1px solid CanvasText; }
}
`;
const Z_INDEX = 2147483647;
const WIDTH_EXTRAS = [
  ['auto', 'auto'],
  ['full', '100%'],
] as const;
/** Presses and clicks on a handle that must not reach the page or the picking of `edit.ts`. */
const GUARDED = ['mousedown', 'mouseup', 'click', 'dblclick', 'auxclick'] as const;

/** One handle in the overlay: the zone that takes the pointer and the bar drawn inside it. */
type HandleNode = { zone: HTMLElement; bar: HTMLElement };
type Layer = { overlay: Overlay; nodes: HandleNode[]; shield: HTMLElement; value: HTMLElement };
type Sent = { property: string; value: HandleValue };
type Live = Track & { start: number; candidates: Candidate[] };
type Drag = {
  id: string;
  pointer: number;
  from: Point;
  at: Point;
  tracks: Live[];
  sent: Sent[];
  moved: boolean;
  space: readonly ScaleStep[];
  /** Ends the hold on the page's swaps (`busy.ts`). */
  free(): void;
};

const pointOf = (event: PointerEvent): Point => ({ x: event.clientX, y: event.clientY });

/** Puts an overlay part at `box`, moved by `shift`. */
function place(node: HTMLElement, box: Box, shift: Point): void {
  node.style.left = `${box.left + shift.x}px`;
  node.style.top = `${box.top + shift.y}px`;
  node.style.width = `${box.width}px`;
  node.style.height = `${box.height}px`;
}

export function createHandles(deps: HandlesDeps): Handles {
  const head = { kitvas: 1 as const, channel: deps.channel };
  const preview = createPreview();
  const guides = createGuides();
  let on = false;
  let id: string | null = null;
  let zoom = 1;
  let blocked: ReadonlySet<string> = new Set();
  let stepped: ReadonlySet<string> = new Set();
  let layer: Layer | undefined;
  let drag: Drag | undefined;
  /** The click that ends a drag is not a pick. */
  let swallow = false;
  let hoverAt: Point | undefined;
  let guiding = false;
  let frame = 0;
  let observers: { disconnect(): void }[] = [];
  const current = (): Element | undefined =>
    on && id !== null ? elementsWith(new Set([id]))[0] : undefined;
  /** The handles the element shows now: none for a property it cannot take. */
  const spotsOf = (element: Element): Spot[] => allowedSpots(readSpots(element, zoom), blocked);

  function createLayer(): Layer {
    const overlay = createOverlay(HANDLES_HOST, SHEET, Z_INDEX);
    // Every element of the overlay is a `kitvas-` one, so the drag never takes it for the page's.
    const shield = document.createElement('kitvas-shield');
    shield.className = 'shield off';
    const value = document.createElement('kitvas-value');
    value.className = 'value off';
    overlay.root.append(shield, value);
    return { overlay, nodes: [], shield, value };
  }

  function addNode(to: Layer): void {
    const zone = document.createElement('kitvas-handle');
    const bar = document.createElement('kitvas-bar');
    bar.className = 'bar';
    zone.append(bar);
    to.overlay.root.insertBefore(zone, to.shield);
    to.nodes.push({ zone, bar });
  }

  /** Puts every handle where the element is now. */
  function draw(): void {
    frame = 0;
    const element = current();
    if (!element && !layer) return;
    layer ??= createLayer();
    const spots = element ? spotsOf(element) : [];
    const origin = layer.overlay.origin();
    const shift = { x: scrollX - origin.x, y: scrollY - origin.y };
    while (layer.nodes.length < spots.length) addNode(layer);
    for (const [index, { zone, bar }] of layer.nodes.entries()) {
      const spot = spots[index];
      zone.className = spot ? 'handle' : 'handle off';
      if (!spot) continue;
      zone.dataset.kind = spot.kind;
      zone.dataset.axis = spot.axis;
      // Where zones meet, the pointer gets the first one, the one `spotAt` answers with.
      zone.style.zIndex = String(spots.length - index);
      place(zone, spot.hit, shift);
      place(bar, spot.box, { x: -spot.hit.left, y: -spot.hit.top });
      bar.style.borderWidth = `${zoom}px`;
      bar.style.borderRadius = `${2 * zoom}px`;
    }
  }

  function schedule(): void {
    if (!on || frame !== 0) return;
    frame = requestAnimationFrame(draw);
  }

  /** The pixels a property has now, and for a width what `auto` and `100%` would give. */
  function begin(element: Element, track: Track, scales: Scales, elementId: string): Live {
    const style = getComputedStyle(element);
    const { property } = track;
    if (property !== 'width' && property !== 'height') {
      let name = property;
      if (property === 'gap') name = track.axis === 'x' ? 'column-gap' : 'row-gap';
      const start = px(style.getPropertyValue(name));
      return { ...track, start, candidates: candidatesFor(property, scales) };
    }
    const wide = property === 'width';
    const around = aroundOf(style, wide ? ['left', 'right'] : ['top', 'bottom']);
    const size = (): number => {
      const box = boxOf(element);
      return Math.max(0, (wide ? box.width : box.height) - around);
    };
    const start = size();
    const extras: Extras = {};
    // Measured on the element itself, in the frame only, and taken back at once.
    for (const [key, value] of wide ? WIDTH_EXTRAS : []) {
      preview.apply([{ id: elementId, kind: 'style', property, value }]);
      extras[key] = size();
      preview.clear();
    }
    return { ...track, start, candidates: candidatesFor(property, scales, extras) };
  }

  function update(point: Point, shift: boolean, alt: boolean): void {
    const moving = drag;
    if (!moving || !layer) return;
    moving.at = point;
    const far = Math.hypot(point.x - moving.from.x, point.y - moving.from.y);
    moving.moved ||= far >= THRESHOLD * zoom;
    if (!moving.moved) return;
    const changes: PreviewChange[] = [];
    const next: Sent[] = [];
    const labels: string[] = [];
    for (const track of moving.tracks) {
      const property = propertyOf(track.property, alt);
      const size = pxAfter(track.start, track, moving.from, point);
      const reach = reachOf(track.property, stepped, zoom);
      // A property a kit prop covers has no free value, so Shift does not free it either.
      const free = shift && !stepped.has(track.property);
      const result = resolve(size, free, track.candidates, reach);
      changes.push({ id: moving.id, kind: 'style', property, value: result.css });
      next.push({ property, value: result.value });
      labels.push(result.label);
    }
    // From the element as it was each time: Alt may have changed which property is previewed.
    preview.clear();
    preview.apply(changes);
    for (const [index, item] of next.entries()) {
      if (JSON.stringify(item) === JSON.stringify(moving.sent[index])) continue;
      deps.post({ ...head, type: 'handle', id: moving.id, ...item, done: false });
    }
    moving.sent = next;
    const origin = layer.overlay.origin();
    const { value } = layer;
    value.textContent = labels.join(' × ');
    value.style.left = `${point.x + scrollX - origin.x + LABEL_OFFSET * zoom}px`;
    value.style.top = `${point.y + scrollY - origin.y + LABEL_OFFSET * zoom}px`;
    // Of the overlay's own label, never of a page element: it keeps its size on the screen.
    value.style.transform = `scale(${zoom})`;
    value.classList.remove('off');
    guides.measure(moving.id, point, moving.space);
    draw();
  }

  /** Ends the drag: the preview goes first, so the page's write starts from the real element. */
  function finish(commit: boolean): void {
    const ending = drag;
    if (!ending) return;
    drag = undefined;
    swallow = true;
    preview.clear();
    guides.hide();
    if (layer) {
      layer.shield.classList.add('off');
      layer.value.classList.add('off');
      const { host } = layer.overlay;
      if (host.hasPointerCapture(ending.pointer)) host.releasePointerCapture(ending.pointer);
    }
    ending.free();
    if (commit && ending.moved) {
      for (const item of ending.sent) {
        deps.post({ ...head, type: 'handle', id: ending.id, ...item, done: true });
      }
    }
    schedule();
  }

  const stop = (event: Event): void => {
    event.stopImmediatePropagation();
    event.preventDefault();
  };

  function onDown(event: PointerEvent): void {
    swallow = false;
    if (!layer || drag || event.target !== layer.overlay.host) return;
    // The page and the other tools never see a press on a handle.
    stop(event);
    const element = current();
    const elementId = id;
    const from = pointOf(event);
    const spot = element ? spotAt(from, spotsOf(element)) : undefined;
    if (!element || !spot || elementId === null || event.button !== 0) return;
    const scales = deps.scales();
    const tracks = tracksOf(spot).map((track) => begin(element, track, scales, elementId));
    const pointer = event.pointerId;
    drag = {
      id: elementId,
      pointer,
      from,
      at: from,
      tracks,
      sent: [],
      moved: false,
      space: scales.space,
      // From the press to the release: the page is not swapped under a handle that is held.
      free: hold(),
    };
    layer.shield.dataset.axis = spot.axis;
    layer.shield.classList.remove('off');
    try {
      layer.overlay.host.setPointerCapture(pointer);
    } catch {
      // A pointer that is already gone cannot be captured; the shield still gets its events.
    }
  }

  function onMove(event: PointerEvent): void {
    if (drag) {
      if (event.pointerId === drag.pointer) update(pointOf(event), event.shiftKey, event.altKey);
      return;
    }
    if (!on || id === null) return;
    hoverAt = pointOf(event);
    if (event.altKey) {
      guiding = true;
      guides.measure(id, hoverAt, deps.scales().space);
    } else if (guiding) {
      guiding = false;
      guides.hide();
    }
  }

  function onUp(event: PointerEvent): void {
    if (!drag || event.pointerId !== drag.pointer) return;
    stop(event);
    const kept = event.type === 'pointerup';
    if (kept) update(pointOf(event), event.shiftKey, event.altKey);
    finish(kept);
  }

  function onGuarded(event: Event): void {
    if (!drag && !swallow && !(layer && event.target === layer.overlay.host)) return;
    stop(event);
    if (event.type === 'click') swallow = false;
  }

  function onKey(event: KeyboardEvent): void {
    if (drag) {
      if (event.key === 'Escape' && event.type === 'keydown') {
        stop(event);
        finish(false);
      } else if (event.key === 'Shift' || event.key === 'Alt') {
        // Alt alone would open the browser's menu on some systems.
        if (event.key === 'Alt') event.preventDefault();
        update(drag.at, event.shiftKey, event.altKey);
      }
      return;
    }
    if (!on || id === null || event.key !== 'Alt') return;
    event.preventDefault();
    guiding = event.type === 'keydown' && hoverAt !== undefined;
    if (guiding && hoverAt) guides.measure(id, hoverAt, deps.scales().space);
    else guides.hide();
  }

  // Listening from the start, before edit mode adds its own listeners on the window: a press on a
  // handle is stopped here first. All of them do nothing while the handles are off.
  if (typeof window !== 'undefined') {
    const capture = { capture: true };
    window.addEventListener('pointerdown', onDown, capture);
    window.addEventListener('pointermove', onMove, { capture: true, passive: true });
    window.addEventListener('pointerup', onUp, capture);
    window.addEventListener('pointercancel', onUp, capture);
    window.addEventListener('keydown', onKey, capture);
    window.addEventListener('keyup', onKey, capture);
    for (const type of GUARDED) window.addEventListener(type, onGuarded, capture);
    // Capture: scrolling inside any scroll box of the prototype moves its elements too.
    window.addEventListener('scroll', schedule, { capture: true, passive: true });
    window.addEventListener('resize', schedule, { passive: true });
  }

  function watch(): void {
    if (typeof ResizeObserver === 'function') {
      const resizes = new ResizeObserver(schedule);
      resizes.observe(document.documentElement);
      resizes.observe(document.body);
      observers.push(resizes);
    }
    if (typeof MutationObserver === 'function') {
      // A render or a preview may move the element without resizing the page.
      const changes = new MutationObserver(schedule);
      changes.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ['class', 'style', 'hidden'],
      });
      observers.push(changes);
    }
  }

  return {
    enable(next) {
      if (next === on) return;
      if (!next) finish(false);
      on = next;
      if (on) {
        watch();
        draw();
        return;
      }
      for (const observer of observers) observer.disconnect();
      observers = [];
      cancelAnimationFrame(frame);
      frame = 0;
      layer?.overlay.remove();
      layer = undefined;
      guides.dispose();
      hoverAt = undefined;
      guiding = false;
      swallow = false;
    },

    show(next) {
      if (next === id) return;
      finish(false);
      id = next;
      guiding = false;
      guides.hide();
      if (on) draw();
    },

    scale(value) {
      zoom = value > 0 && Number.isFinite(value) ? value : 1;
      guides.scale(zoom);
      if (on) draw();
    },

    limit(nextBlocked, nextStepped) {
      blocked = new Set(nextBlocked);
      stepped = new Set(nextStepped);
      if (on) draw();
    },
  };
}
