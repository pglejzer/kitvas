// The drop indicator in the frame's overlay (spec 4b, decision 11; plan 14, task C1; ADR 0066): a
// line where the dragged thing would go, a soft outline of the element that would take it, and a
// faint outline of every list a dragged item can go to. In viewport pixels like everything in
// `slots.ts`, which re-exports it.

import type { Box, Point, Slot } from '../drag/slots.ts';
import { overlayHostStyle } from '../page/overlay-host.ts';
import { toned } from '../tones/tones.ts';

/** The indicator line's thickness, in pixels on the screen. */
const LINE = 2;
/** The thickness of the outline of the element that takes the drop, when a line shows the place. */
const SOFT = 1;
/** The most lists outlined at once. */
export const MAX_LISTS = 60;

/**
 * Where the indicator's parts go inside the overlay, whose own corner is at `host`. `scale`:
 * frame pixels per pixel on the screen, so the line keeps its thickness at any canvas zoom.
 */
export function placeIndicator(
  slot: Slot,
  host: Point,
  scale = 1,
): { line: Box | null; box: Box | null } {
  const { line, box } = slot;
  const thick = LINE * scale;
  return {
    line: line && {
      left: line.x - host.x - (line.axis === 'y' ? thick / 2 : 0),
      top: line.y - host.y - (line.axis === 'x' ? thick / 2 : 0),
      width: line.axis === 'x' ? line.length : thick,
      height: line.axis === 'y' ? line.length : thick,
    },
    box: box && { ...box, left: box.left - host.x, top: box.top - host.y },
  };
}

/** The indicator in the frame's overlay (not part of the page, like the marks). */
export type Indicator = {
  /**
   * The slot under the pointer; `lists`: the box of every list a dragged item can go to. Nothing
   * of either takes the indicator away.
   */
  show(slot: Slot | null, lists?: readonly Box[]): void;
  /** Frame pixels per pixel on the screen: the inverse of the canvas zoom. */
  scale(value: number): void;
  dispose(): void;
};

// The studio's selection colour (`toned`; custom properties reach into a shadow root); the
// system colour stands in until the studio has said its tones.
const COLOUR = 'var(--kv-select, Highlight)';

const SHEET = `
.line, .box, .list {
  position: absolute; left: 0; top: 0; box-sizing: border-box; pointer-events: none;
}
.line { background: ${COLOUR}; border-radius: ${LINE / 2}px; }
.box { outline: ${SOFT}px solid ${COLOUR}; outline-offset: -${SOFT}px; opacity: 0.6; }
.box[data-alone] { opacity: 1; }
.list { outline: ${SOFT}px dashed ${COLOUR}; outline-offset: -${SOFT}px; opacity: 0.35; }
.off { display: none; }
@media (forced-colors: active) {
  .line { background: Highlight; }
  .box, .list { outline-color: Highlight; opacity: 1; }
}
`;

const HOST_STYLE = overlayHostStyle(2147483646);

type Layer = {
  host: HTMLElement;
  root: ShadowRoot;
  line: HTMLElement;
  box: HTMLElement;
  lists: HTMLElement[];
};

function createLayer(document: Document): Layer {
  const host = document.createElement('kitvas-slot');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = HOST_STYLE;
  toned(host);
  const root = host.attachShadow({ mode: 'closed' });
  const sheet = document.createElement('style');
  sheet.textContent = SHEET;
  const box = document.createElement('div');
  box.className = 'box off';
  const line = document.createElement('div');
  line.className = 'line off';
  root.append(sheet, box, line);
  return { host, root, line, box, lists: [] };
}

function setBox(node: HTMLElement, box: Box | null): void {
  node.classList.toggle('off', box === null);
  if (!box) return;
  node.style.left = `${box.left}px`;
  node.style.top = `${box.top}px`;
  node.style.width = `${box.width}px`;
  node.style.height = `${box.height}px`;
}

function setOutline(node: HTMLElement, thick: number): void {
  node.style.outlineWidth = `${thick}px`;
  node.style.outlineOffset = `${-thick}px`;
}

/**
 * One line, one box and the lists' outlines in an overlay of their own at the end of `body`,
 * inside a closed shadow root, made on the first slot shown. The caller shows the slot again when
 * the page scrolls.
 */
export function createIndicator(document: Document): Indicator {
  let layer: Layer | undefined;
  let zoom = 1;

  /** A faint outline for each list, under the line and the box. */
  function drawLists(to: Layer, lists: readonly Box[], host: Point): void {
    const shown = lists.slice(0, MAX_LISTS);
    while (to.lists.length < shown.length) {
      const node = document.createElement('div');
      node.className = 'list off';
      to.root.insertBefore(node, to.box);
      to.lists.push(node);
    }
    for (const [index, node] of to.lists.entries()) {
      const box = shown[index];
      setBox(node, box ? { ...box, left: box.left - host.x, top: box.top - host.y } : null);
      if (box) setOutline(node, SOFT * zoom);
    }
  }

  return {
    show(slot, lists = []) {
      if (!slot && lists.length === 0) {
        if (!layer) return;
        setBox(layer.line, null);
        setBox(layer.box, null);
        for (const node of layer.lists) setBox(node, null);
        return;
      }
      layer ??= createLayer(document);
      // A page that replaced its body's content took the overlay out with it.
      if (!layer.host.isConnected) document.body.append(layer.host);
      const corner = layer.host.getBoundingClientRect();
      const host = { x: corner.left, y: corner.top };
      drawLists(layer, lists, host);
      const placed = slot ? placeIndicator(slot, host, zoom) : { line: null, box: null };
      layer.line.style.borderRadius = `${(LINE * zoom) / 2}px`;
      // With no line to show the place, the outline of the element that takes the drop says it.
      const alone = placed.line === null;
      layer.box.toggleAttribute('data-alone', alone);
      setOutline(layer.box, (alone ? LINE : SOFT) * zoom);
      setBox(layer.line, placed.line);
      setBox(layer.box, placed.box);
    },
    scale(value) {
      zoom = value > 0 && Number.isFinite(value) ? value : 1;
    },
    dispose() {
      layer?.host.remove();
      layer = undefined;
    },
  };
}
