// The marks the studio asks for, drawn on the prototype: a numbered dot at the top-right corner of
// each marked element, and an outline around changed and added ones. Everything sits in one
// overlay at the end of `body`, inside a closed shadow root: the prototype's styles do not reach
// it and its own styles do not leak. It never takes pointer events and is hidden from assistive
// technology. Positions are page coordinates, so the marks scroll with the page; they are worked
// out again on scroll, resize and size changes, once per animation frame.

import type { Mark, Tone } from '../../channel/protocol.ts';
import { DOT, placeDots, placeRing, type Rect } from '../drag/place.ts';

// Studio tokens do not exist inside a prototype. These are Base's ink and white, the only
// literal colours in `client/frame/`.
const INK = '#1d2025';
const WHITE = '#ffffff';

const SHEET = `
.dot, .ring { position: absolute; left: 0; top: 0; box-sizing: border-box; pointer-events: none; }
.dot {
  min-width: ${DOT}px; height: ${DOT}px; padding: 0 6px; border-radius: ${DOT / 2}px;
  display: flex; align-items: center; justify-content: center; white-space: nowrap;
  font: 700 12px/1 system-ui, -apple-system, "Segoe UI", sans-serif;
  font-variant-numeric: tabular-nums; letter-spacing: 0;
  background: ${WHITE}; color: ${INK}; box-shadow: inset 0 0 0 2px ${INK}, 0 0 0 1px ${WHITE};
}
.dot[data-tone="fix"] { background: ${INK}; color: ${WHITE}; box-shadow: 0 0 0 2px ${WHITE}; }
.ring {
  outline: 2px solid ${INK}; outline-offset: 0;
  box-shadow: 0 0 0 3px ${WHITE}, inset 0 0 0 1px ${WHITE};
}
.ring[data-tone="added"] { outline-style: dashed; }
.off { display: none; }
@media (forced-colors: active) {
  .dot { border: 2px solid CanvasText; }
  .ring { outline-color: CanvasText; }
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
  'z-index: 2147483647',
];
/** Inline and important, so no rule of the prototype moves or hides the overlay itself. */
const HOST_STYLE = HOST_RULES.map((rule) => `${rule} !important;`).join(' ');

export type Marks = {
  /** Draws `marks`, replacing the ones drawn before. An empty list removes the overlay. */
  draw(marks: Mark[]): void;
  /** Keeps the marks on their elements every frame until `until` settles (a state's motion). */
  follow(until: Promise<unknown>): void;
};

/** The marks of one element. */
type Group = {
  id: string;
  element: Element;
  dots: HTMLElement[];
  widths: number[];
  ring: HTMLElement | undefined;
};

type Layer = { host: HTMLElement; rings: HTMLElement; dots: HTMLElement };

/** The first element with each id: a mark goes on the first of elements a loop rendered. */
function firstById(): Map<string, Element> {
  const found = new Map<string, Element>();
  for (const element of document.querySelectorAll('[data-ks]')) {
    const id = element.getAttribute('data-ks') ?? '';
    if (!found.has(id)) found.set(id, element);
  }
  return found;
}

/** Marks in their order, one entry per element id. */
function byElement(marks: Mark[]): Map<string, Mark[]> {
  const groups = new Map<string, Mark[]>();
  for (const mark of marks) {
    const list = groups.get(mark.id);
    if (list) list.push(mark);
    else groups.set(mark.id, [mark]);
  }
  return groups;
}

function createLayer(): Layer {
  const host = document.createElement('kitvas-marks');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = HOST_STYLE;
  const shadow = host.attachShadow({ mode: 'closed' });
  const sheet = document.createElement('style');
  sheet.textContent = SHEET;
  const rings = document.createElement('div');
  const dots = document.createElement('div');
  shadow.append(sheet, rings, dots);
  document.body.append(host);
  return { host, rings, dots };
}

function part(kind: 'dot' | 'ring', tone: Tone): HTMLElement {
  const node = document.createElement('div');
  node.className = kind;
  node.dataset.tone = tone;
  return node;
}

function makeGroup(layer: Layer, id: string, element: Element, marks: Mark[]): Group {
  const outlined = marks.find((mark) => mark.tone === 'changed' || mark.tone === 'added');
  const ring = outlined ? part('ring', outlined.tone) : undefined;
  if (ring) layer.rings.append(ring);
  const dots = marks.map((mark) => {
    const dot = part('dot', mark.tone);
    // Text only: a label is never read as markup.
    dot.textContent = mark.label;
    layer.dots.append(dot);
    return dot;
  });
  return { id, element, dots, widths: [], ring };
}

const pageRect = (element: Element): Rect => {
  const { left, top, width, height } = element.getBoundingClientRect();
  return { left: left + scrollX, top: top + scrollY, width, height };
};

function setPlace(node: HTMLElement, left: number, top: number): void {
  node.style.left = `${left}px`;
  node.style.top = `${top}px`;
}

export function createMarks(): Marks {
  let layer: Layer | undefined;
  let groups: Group[] = [];
  let frame = 0;
  const observer =
    typeof ResizeObserver === 'function' ? new ResizeObserver(() => schedule()) : undefined;

  /** Puts every mark where its element is now. */
  function update(): void {
    if (!layer) return;
    const hostRect = pageRect(layer.host);
    const host = { left: hostRect.left, top: hostRect.top };
    const pageWidth = document.documentElement.clientWidth;
    for (const group of groups) {
      // React may have replaced the element since the marks came; the id finds its successor.
      if (!group.element.isConnected) {
        // Ids are checked by the protocol: no quote or backslash can end the selector.
        const again = document.querySelector(`[data-ks="${group.id}"]`);
        if (again) {
          group.element = again;
          observer?.observe(again);
        }
      }
      const rect = pageRect(group.element);
      const shown = group.element.isConnected && (rect.width > 0 || rect.height > 0);
      const input = { element: rect, widths: group.widths, host, pageWidth };
      const points = shown ? placeDots(input) : [];
      for (const [index, dot] of group.dots.entries()) {
        const point = points[index];
        dot.classList.toggle('off', !point);
        if (point) setPlace(dot, point.left, point.top);
      }
      if (!group.ring) continue;
      const ring = shown ? placeRing(rect, host, pageWidth) : undefined;
      group.ring.classList.toggle('off', !ring);
      if (!ring) continue;
      setPlace(group.ring, ring.left, ring.top);
      group.ring.style.width = `${ring.width}px`;
      group.ring.style.height = `${ring.height}px`;
    }
  }

  function schedule(): void {
    if (frame !== 0) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      update();
    });
  }

  function listen(): void {
    // Capture: scrolling inside any scroll box of the prototype moves its elements too.
    document.addEventListener('scroll', schedule, { capture: true, passive: true });
    window.addEventListener('resize', schedule);
    window.addEventListener('load', schedule);
  }

  function unlisten(): void {
    document.removeEventListener('scroll', schedule, { capture: true });
    window.removeEventListener('resize', schedule);
    window.removeEventListener('load', schedule);
  }

  function clear(): void {
    observer?.disconnect();
    for (const group of groups) {
      for (const dot of group.dots) dot.remove();
      group.ring?.remove();
    }
    groups = [];
  }

  return {
    draw(marks) {
      clear();
      if (marks.length === 0) {
        if (layer) {
          layer.host.remove();
          unlisten();
        }
        layer = undefined;
        return;
      }
      if (!layer) {
        layer = createLayer();
        listen();
        // Web fonts that arrive later change the boxes.
        document.fonts?.ready.then(schedule, () => undefined);
      }
      const elements = firstById();
      for (const [id, list] of byElement(marks)) {
        const element = elements.get(id);
        // A mark whose element is not on the page is skipped.
        if (element) groups.push(makeGroup(layer, id, element, list));
      }
      // One layout for all the widths, after every dot is in place.
      for (const group of groups) group.widths = group.dots.map((dot) => dot.offsetWidth || DOT);
      observer?.observe(document.documentElement);
      observer?.observe(document.body);
      for (const group of groups) observer?.observe(group.element);
      update();
    },

    follow(until) {
      let active = true;
      const tick = (): void => {
        if (!active) return;
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
  };
}
