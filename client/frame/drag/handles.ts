// Magnetic handles and distance guides on the selected element (spec 4b, decision 12; plan 14,
// task C3): size handles snap to the `size` scale (plus 100% and auto), padding and gap handles
// to the `space` scale; Shift releases the snap (a raw value). A handle previews on the element
// and posts `handle` while it moves and once with `done` when let go. Alt+hover, a handle drag
// and a move drag show the distance to the element under the pointer, in px and the nearest step.
//
// The handles sit in an overlay of the frame's own (a closed shadow root at the end of `body`).
// The only thing ever set on a page element is the inline preview of the dragged property, taken
// back before the release is posted; never a position, an offset or a transform. What a drag
// snaps to is pure and here; where the handles go is pure and in `guides.ts`.

import type { PreviewChange } from '../../channel/edit-protocol.ts';
import type {
  HandleValue,
  ScaleStep,
  StructureFrameMessage,
} from '../../channel/structure-protocol.ts';
import { createPreview } from '../edit/preview.ts';
import { elementsWith } from '../edit/tree.ts';
import {
  createGuides,
  createOverlay,
  MAX_GAPS,
  type Overlay,
  type Side,
  type Spot,
  spotAt,
  spotsFor,
} from './guides.ts';
import type { Box, Point } from './slots.ts';

export type HandlesDeps = {
  post(message: StructureFrameMessage): void;
  channel: string;
  scales(): { space: readonly ScaleStep[]; size: readonly ScaleStep[] };
};

export type Handles = {
  /** On only in edit mode with nothing else dragging; off removes every handle. */
  enable(on: boolean): void;
  /** The element the handles sit on; `null` or several selected: none. */
  show(id: string | null): void;
};

/** The overlay's host element: a pointer event whose target it is belongs to a handle. */
export const HANDLES_HOST = 'kitvas-handles';

export type Scales = ReturnType<HandlesDeps['scales']>;
/** One property a drag changes: `sign` 1 when moving right or down makes the value larger. */
export type Track = { property: string; axis: 'x' | 'y'; sign: 1 | -1 };
/** A value a handle snaps to, with its size in the element's own pixels. */
export type Candidate = { value: HandleValue; px: number; label: string };
/** What `width: auto` and `width: 100%` come to on the element, measured by the frame. */
export type Extras = { auto?: number; full?: number };
export type Resolved = { value: HandleValue; css: string; label: string };

/** A press that moves less than this is no drag and writes nothing. */
const THRESHOLD = 3;

/** What a handle can snap to: the kit's scale, and for a width also `auto` and `100%`. */
export function candidatesFor(property: string, scales: Scales, extras: Extras = {}): Candidate[] {
  const sized = property === 'width' || property === 'height';
  const candidates = (sized ? scales.size : scales.space).map(
    (step): Candidate => ({ value: { token: step.var }, px: step.px, label: step.name }),
  );
  if (property !== 'width') return candidates;
  if (extras.auto !== undefined) {
    candidates.push({ value: { raw: 'auto' }, px: extras.auto, label: 'auto' });
  }
  if (extras.full !== undefined) {
    candidates.push({ value: { raw: '100%' }, px: extras.full, label: '100%' });
  }
  return candidates;
}

/** The candidate nearest to `px`; the earlier one of two equally near. */
export function snapTo(px: number, candidates: readonly Candidate[]): Candidate | undefined {
  let best: Candidate | undefined;
  for (const candidate of candidates) {
    if (!best || Math.abs(candidate.px - px) < Math.abs(best.px - px)) best = candidate;
  }
  return best;
}

/** The value a handle at `px` stands for: the nearest candidate, or with Shift the raw pixels. */
export function resolve(px: number, shift: boolean, candidates: readonly Candidate[]): Resolved {
  const snapped = shift ? undefined : snapTo(px, candidates);
  if (!snapped) {
    const raw = `${Math.round(Math.max(0, px))}px`;
    return { value: { raw }, css: raw, label: raw };
  }
  if ('raw' in snapped.value) {
    return { value: snapped.value, css: snapped.value.raw, label: snapped.label };
  }
  const label = `${snapped.label} · ${Math.round(snapped.px)}px`;
  return { value: snapped.value, css: `var(${snapped.value.token})`, label };
}

/** The properties a handle changes: the corner changes two. */
export function tracksOf(spot: Spot): Track[] {
  if (spot.kind === 'size' || spot.axis === 'both') {
    return [
      { property: 'width', axis: 'x', sign: 1 },
      { property: 'height', axis: 'y', sign: 1 },
    ];
  }
  return [{ property: spot.kind, axis: spot.axis, sign: spot.sign }];
}

/** With Alt a padding handle moves both sides of its axis together. */
export function propertyOf(property: string, alt: boolean): string {
  if (!alt) return property;
  if (property === 'padding-top' || property === 'padding-bottom') return 'padding-block';
  if (property === 'padding-left' || property === 'padding-right') return 'padding-inline';
  return property;
}

/** The value in pixels after the pointer went from `from` to `to`; never under zero. */
export function pxAfter(start: number, track: Track, from: Point, to: Point): number {
  const moved = track.axis === 'x' ? to.x - from.x : to.y - from.y;
  return Math.max(0, start + track.sign * moved);
}

// The DOM part. System colours stand in for a kit without the variable; no literal colour here.
const FOCUS = 'var(--kit-color-focus, Highlight)';
const SHEET = `
.handle, .value { position: absolute; left: 0; top: 0; box-sizing: border-box; }
.handle {
  pointer-events: auto; touch-action: none; border-radius: 3px;
  background: var(--kit-color-surface, Canvas); border: 1px solid ${FOCUS};
}
.handle[data-kind^="padding"], .handle[data-kind="gap"] {
  background: ${FOCUS}; border-color: var(--kit-color-surface, Canvas);
}
.shield { position: fixed; inset: 0; pointer-events: auto; touch-action: none; }
[data-axis="x"] { cursor: ew-resize; }
[data-axis="y"] { cursor: ns-resize; }
[data-axis="both"] { cursor: nwse-resize; }
.value {
  pointer-events: none; padding: 2px 5px; border-radius: 3px; white-space: nowrap;
  font: 600 11px/1.2 system-ui, -apple-system, "Segoe UI", sans-serif;
  font-variant-numeric: tabular-nums; letter-spacing: 0;
  background: var(--kit-color-ink, CanvasText); color: var(--kit-color-surface, Canvas);
}
.off { display: none; }
@media (forced-colors: active) {
  .handle { background: Canvas; border-color: Highlight; }
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

type Layer = { overlay: Overlay; nodes: HTMLElement[]; shield: HTMLElement; value: HTMLElement };
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
};

const px = (value: string): number => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const boxOf = (element: Element): Box => {
  const { left, top, width, height } = element.getBoundingClientRect();
  return { left, top, width, height };
};
const pointOf = (event: PointerEvent): Point => ({ x: event.clientX, y: event.clientY });

/** What a content-box element's CSS size leaves out on one axis: its padding and borders. */
function aroundOf(style: CSSStyleDeclaration, sides: readonly [Side, Side]): number {
  if (style.boxSizing === 'border-box') return 0;
  let sum = 0;
  for (const side of sides) {
    sum += px(style.getPropertyValue(`padding-${side}`));
    sum += px(style.getPropertyValue(`border-${side}-width`));
  }
  return sum;
}

function readSpots(element: Element): Spot[] {
  const style = getComputedStyle(element);
  const side = (name: Side): number => px(style.getPropertyValue(`padding-${name}`));
  const padding = {
    top: side('top'),
    right: side('right'),
    bottom: side('bottom'),
    left: side('left'),
  };
  const children = [...element.children]
    .map(boxOf)
    .filter((box) => box.width > 0 || box.height > 0)
    .slice(0, MAX_GAPS + 1);
  return spotsFor({ box: boxOf(element), padding, display: style.display, children });
}

export function createHandles(deps: HandlesDeps): Handles {
  const head = { kitvas: 1 as const, channel: deps.channel };
  const preview = createPreview();
  const guides = createGuides();
  let on = false;
  let id: string | null = null;
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

  /** Puts every handle where the element is now. */
  function draw(): void {
    frame = 0;
    const element = current();
    if (!element && !layer) return;
    layer ??= createLayer();
    const spots = element ? readSpots(element) : [];
    const origin = layer.overlay.origin();
    while (layer.nodes.length < spots.length) {
      const node = document.createElement('kitvas-handle');
      layer.overlay.root.insertBefore(node, layer.shield);
      layer.nodes.push(node);
    }
    for (const [index, node] of layer.nodes.entries()) {
      const spot = spots[index];
      node.className = spot ? 'handle' : 'handle off';
      if (!spot) continue;
      node.dataset.kind = spot.kind;
      node.dataset.axis = spot.axis;
      node.style.left = `${spot.box.left + scrollX - origin.x}px`;
      node.style.top = `${spot.box.top + scrollY - origin.y}px`;
      node.style.width = `${spot.box.width}px`;
      node.style.height = `${spot.box.height}px`;
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
    const far = Math.hypot(point.x - moving.from.x, point.y - moving.from.y) >= THRESHOLD;
    moving.moved ||= far;
    if (!moving.moved) return;
    const changes: PreviewChange[] = [];
    const next: Sent[] = [];
    const labels: string[] = [];
    for (const track of moving.tracks) {
      const property = propertyOf(track.property, alt);
      const size = pxAfter(track.start, track, moving.from, point);
      const result = resolve(size, shift, track.candidates);
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
    layer.value.textContent = labels.join(' × ');
    layer.value.style.left = `${point.x + scrollX - origin.x + 14}px`;
    layer.value.style.top = `${point.y + scrollY - origin.y + 14}px`;
    layer.value.classList.remove('off');
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
    const spot = element ? spotAt(from, readSpots(element)) : undefined;
    if (!element || !spot || elementId === null || event.button !== 0) return;
    const scales = deps.scales();
    const tracks = tracksOf(spot).map((track) => begin(element, track, scales, elementId));
    const pointer = event.pointerId;
    const { space } = scales;
    drag = { id: elementId, pointer, from, at: from, tracks, sent: [], moved: false, space };
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
  };
}
