// The lens pins in the frame (redesign spec, goal 9; plan 19, task 1): what the lens that is on says
// about the draft, a small pill on each element it names, as mock v10 draws it (22 px high, the pop
// tone, an optional tone dot and code word; a card pin with a second line is 214 px wide and wraps)
// and, for the Changes lens, a dashed outline around the element. As the other overlays: one host
// at the end of `body`, a closed shadow root, hidden from assistive technology, the studio's tones
// (`toned`) over system colours, placed again once per animation frame on scroll, resize, a size
// change, a render and a build taken in place. The page sends the pins; nothing of them is ever in
// a build or a draft file.
//
// The one difference (spec goal 9): a pin takes the pointer, and a click on it is reported to the
// studio. A press or a click on a pin does nothing else. Outside a closed shadow root every listener
// sees the host as the event's target, so this overlay listens on the window from the start, before
// the editor and the gestures add theirs, and there stops every pointer event whose target is its
// host: no pick, drag, rectangle, inline edit, menu, handler of the draft or link under the pin
// hears it, in Preview as in Edit.

import type { LensPin } from '../../channel/lens-protocol.ts';
import { placeRing, type Rect } from '../drag/place.ts';
import { toned } from '../tones/tones.ts';
import { CARD_WIDTH, PIN_HEIGHT, pinAt, placeLensPin, type Size } from './place.ts';

/** The overlay's host element: what the frame's other listeners see as the target of a pin's press. */
export const LENS_HOST = 'kitvas-lens-pins';

/** Whether an event's target is the lens pins' host: a press on a pin, seen from outside. */
export function isLensHost(target: unknown): boolean {
  return (
    typeof target === 'object' &&
    target !== null &&
    'localName' in target &&
    target.localName === LENS_HOST
  );
}

export type LensPins = {
  /** Draws `pins` in place of the ones drawn before; an empty list takes the overlay away. */
  set(pins: readonly LensPin[]): void;
  /** Keeps the pins on their elements every frame until `until` settles (a state's motion). */
  follow(until: Promise<unknown>): void;
  /** A build was taken in place: the elements are found again by their ids. */
  swapped(): void;
};

export type LensPinsDeps = {
  /** A click on the pin with this key; the runtime posts it to the studio. */
  report(key: string): void;
};

// Studio tokens do not exist inside a prototype: the colours are the studio's tones (`toned`, set on
// the host), with system colours until the studio has said them. No literal colour here.
const SHEET = `
.pin {
  position: absolute; left: 0; top: 0; box-sizing: border-box; pointer-events: auto;
  cursor: pointer; user-select: none; -webkit-user-select: none;
  display: flex; flex-direction: column; justify-content: center; gap: 3px;
  height: ${PIN_HEIGHT}px; max-width: 320px; padding: 0 8px; border-radius: 6px;
  font: 400 11px/1.2 system-ui, -apple-system, "Segoe UI", sans-serif; letter-spacing: 0;
  white-space: nowrap; text-align: left;
  background: var(--kv-pop, Canvas); color: var(--kv-ink, CanvasText);
  box-shadow: var(--kv-pop-shadow, 0 0 0 1px CanvasText);
}
.row { display: flex; align-items: center; gap: 6px; min-width: 0; }
.text { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.dot {
  flex: none; width: 7px; height: 7px; border-radius: 50%;
  background: var(--kv-review, GrayText);
}
.dot[data-tone="fix"] { background: var(--kv-fix, CanvasText); }
.dot[data-tone="good"] { background: var(--kv-good, GrayText); }
code {
  flex: none; font: 10.5px/1.2 ui-monospace, "Cascadia Code", Consolas, monospace;
  color: var(--kv-ink-mid, CanvasText);
}
.card {
  width: ${CARD_WIDTH}px; max-width: none; height: auto; padding: 8px 10px;
  align-items: flex-start; white-space: normal; line-height: 1.45;
}
.card .text { font-weight: 600; overflow: visible; overflow-wrap: anywhere; }
small { font-size: 11px; color: var(--kv-ink-mid, CanvasText); overflow-wrap: anywhere; }
.ring {
  position: absolute; left: 0; top: 0; box-sizing: border-box; pointer-events: none;
  outline: 2px dashed var(--kv-select, Highlight); outline-offset: 3px;
}
.off { display: none; }
@media (forced-colors: active) {
  .pin { border: 1px solid CanvasText; }
  .dot { background: CanvasText; }
  .ring { outline-color: Highlight; }
}
`;

const HOST_RULES = [
  'all: initial',
  'position: absolute',
  'left: 0',
  'top: 0',
  'width: 0',
  'height: 0',
  'overflow: visible',
  'pointer-events: none',
  'z-index: 2147483645',
];
/** Inline and important, so no rule of the prototype moves or hides the overlay itself. */
const HOST_STYLE = HOST_RULES.map((rule) => `${rule} !important;`).join(' ');

/** Stopped at the window when the target is a pin: nothing of the page or the editor hears it. */
const POINTER_EVENTS = [
  'pointerdown',
  'mousedown',
  'pointerup',
  'mouseup',
  'click',
  'dblclick',
  'auxclick',
  'contextmenu',
] as const;

type Pinned = {
  pin: LensPin;
  element: Element;
  node: HTMLElement;
  /** The outline around the element: once per element, on its first pin that asks for one. */
  ring: HTMLElement | undefined;
  size: Size;
};

type Layer = { host: HTMLElement; rings: HTMLElement; pins: HTMLElement };

const NOWHERE: Rect = { left: 0, top: 0, width: 0, height: 0 };

const pageRect = (element: Element): Rect => {
  const { left, top, width, height } = element.getBoundingClientRect();
  return { left: left + scrollX, top: top + scrollY, width, height };
};

const viewRect = (element: Element): Rect => {
  const { left, top, width, height } = element.getBoundingClientRect();
  return { left, top, width, height };
};

function setPlace(node: HTMLElement, left: number, top: number): void {
  node.style.left = `${left}px`;
  node.style.top = `${top}px`;
}

/** The first element with each id: a pin goes on the first of the elements a loop rendered. */
function firstById(): Map<string, Element> {
  const found = new Map<string, Element>();
  for (const element of document.querySelectorAll('[data-ks]')) {
    const id = element.getAttribute('data-ks') ?? '';
    if (!found.has(id)) found.set(id, element);
  }
  return found;
}

function part(tag: string, className: string, words?: string): HTMLElement {
  const node = document.createElement(tag);
  if (className !== '') node.className = className;
  // Text only: what a page sends is never read as markup.
  if (words !== undefined) node.textContent = words;
  return node;
}

/** One pin: the tone dot, the code word and the text on a row; a card's second line under them. */
function pinNode(pin: LensPin): HTMLElement {
  const node = part('div', pin.small === undefined ? 'pin' : 'pin card');
  const row = part('span', 'row');
  if (pin.tone !== 'plain') {
    const dot = part('span', 'dot');
    dot.dataset.tone = pin.tone;
    row.append(dot);
  }
  if (pin.code !== undefined) row.append(part('code', '', pin.code));
  row.append(part('span', 'text', pin.text));
  node.append(row);
  if (pin.small !== undefined) node.append(part('small', '', pin.small));
  return node;
}

function createLayer(): Layer {
  const host = document.createElement(LENS_HOST);
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = HOST_STYLE;
  toned(host);
  const shadow = host.attachShadow({ mode: 'closed' });
  const sheet = document.createElement('style');
  sheet.textContent = SHEET;
  // The outlines under the pins: a pin is never hidden by an outline drawn after it.
  const rings = document.createElement('div');
  const pins = document.createElement('div');
  shadow.append(sheet, rings, pins);
  return { host, rings, pins };
}

export function createLensPins({ report }: LensPinsDeps): LensPins {
  /** Made once and kept: only its place in the page comes and goes. */
  let layer: Layer | undefined;
  let attached = false;
  let pinned: Pinned[] = [];
  let frame = 0;
  const resizes =
    typeof ResizeObserver === 'function' ? new ResizeObserver(() => schedule()) : undefined;
  // A render, a preview or a build taken in place may move an element without resizing one.
  const changes =
    typeof MutationObserver === 'function' ? new MutationObserver(() => schedule()) : undefined;

  /** Puts every pin where its element is now, each below the pins placed before it. */
  function update(): void {
    if (!layer || !attached) return;
    const box = pageRect(layer.host);
    const origin = { left: box.left, top: box.top };
    const pageWidth = document.documentElement.clientWidth;
    const taken: Rect[] = [];
    let elements: Map<string, Element> | undefined;
    for (const one of pinned) {
      // React may have replaced the element; the id finds its successor.
      if (!one.element.isConnected) {
        elements ??= firstById();
        const again = elements.get(one.pin.id);
        if (again) {
          one.element = again;
          resizes?.observe(again);
        }
      }
      const rect = pageRect(one.element);
      const shown = one.element.isConnected && (rect.width > 0 || rect.height > 0);
      one.node.classList.toggle('off', !shown);
      one.ring?.classList.toggle('off', !shown);
      if (!shown) continue;
      const point = placeLensPin(rect, one.size, pageWidth, taken);
      taken.push({ ...point, width: one.size.width, height: one.size.height });
      setPlace(one.node, point.left - origin.left, point.top - origin.top);
      if (!one.ring) continue;
      const ring = placeRing(rect, origin, pageWidth);
      one.ring.classList.toggle('off', !ring);
      if (!ring) continue;
      setPlace(one.ring, ring.left, ring.top);
      one.ring.style.width = `${ring.width}px`;
      one.ring.style.height = `${ring.height}px`;
    }
  }

  function schedule(): void {
    if (frame !== 0 || !attached) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      update();
    });
  }

  /** Each pin's size, read once it is in the page (and again when web fonts arrive). */
  function measure(): void {
    for (const one of pinned) {
      const card = one.pin.small !== undefined;
      one.size = {
        width: one.node.offsetWidth || (card ? CARD_WIDTH : PIN_HEIGHT),
        height: one.node.offsetHeight || PIN_HEIGHT,
      };
    }
  }

  function onPointer(event: MouseEvent): void {
    if (!layer || !attached || event.target !== layer.host) return;
    // Nothing else hears a press on a pin (the header of this file says why).
    event.stopImmediatePropagation();
    // No text selection, focus move, menu or link: the pointer events keep their default, so the
    // mouse events and the click still come.
    if (event.type !== 'pointerdown' && event.type !== 'pointerup') event.preventDefault();
    // One report per click: a double click's second click and its `dblclick` say nothing more.
    if (event.type !== 'click' || event.button !== 0 || event.detail > 1) return;
    const boxes = pinned.map((one) =>
      one.node.classList.contains('off') ? NOWHERE : viewRect(one.node),
    );
    const hit = pinned[pinAt(boxes, event.clientX, event.clientY)];
    if (hit) report(hit.pin.key);
  }

  // From the start, before the editor's listeners and the gestures' (`runtime.ts` makes this
  // overlay first): listeners of one target run in the order they were added.
  if (typeof window !== 'undefined') {
    for (const type of POINTER_EVENTS) window.addEventListener(type, onPointer, { capture: true });
  }

  function attach(): Layer {
    layer ??= createLayer();
    if (attached) return layer;
    attached = true;
    document.body.append(layer.host);
    // Capture: scrolling inside any scroll box of the prototype moves its elements too.
    document.addEventListener('scroll', schedule, { capture: true, passive: true });
    window.addEventListener('resize', schedule);
    window.addEventListener('load', schedule);
    changes?.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'hidden'],
    });
    // Web fonts that arrive later change the pins' sizes and the elements' boxes.
    document.fonts?.ready.then(
      () => {
        measure();
        schedule();
      },
      () => undefined,
    );
    return layer;
  }

  function detach(): void {
    if (!layer || !attached) return;
    attached = false;
    cancelAnimationFrame(frame);
    frame = 0;
    document.removeEventListener('scroll', schedule, { capture: true });
    window.removeEventListener('resize', schedule);
    window.removeEventListener('load', schedule);
    changes?.disconnect();
    layer.host.remove();
  }

  function empty(): void {
    resizes?.disconnect();
    for (const one of pinned) {
      one.node.remove();
      one.ring?.remove();
    }
    pinned = [];
  }

  return {
    set(pins) {
      empty();
      if (pins.length === 0) {
        detach();
        return;
      }
      const { rings, pins: list } = attach();
      const elements = firstById();
      const ringed = new Set<string>();
      for (const pin of pins) {
        const element = elements.get(pin.id);
        // A pin whose element is not on the page is skipped.
        if (!element) continue;
        const node = pinNode(pin);
        list.append(node);
        let ring: HTMLElement | undefined;
        if (pin.outline === true && !ringed.has(pin.id)) {
          ringed.add(pin.id);
          ring = part('div', 'ring');
          rings.append(ring);
        }
        pinned.push({ pin, element, node, ring, size: { width: 0, height: PIN_HEIGHT } });
      }
      // One layout for all the sizes, after every pin is in place.
      measure();
      resizes?.observe(document.documentElement);
      resizes?.observe(document.body);
      for (const one of pinned) resizes?.observe(one.element);
      update();
    },

    follow(until) {
      if (!attached) return;
      let active = true;
      const tick = (): void => {
        if (!active || !attached) return;
        update();
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      const end = (): void => {
        active = false;
        schedule();
      };
      until.then(end, end);
    },

    swapped: schedule,
  };
}
