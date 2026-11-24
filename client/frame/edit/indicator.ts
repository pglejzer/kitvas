// The drop indicator in the frame's overlay (spec 4b, decision 11; plan 14, task C1): a line
// between two siblings or an outline of the parent, in viewport pixels like everything in
// `slots.ts`, which re-exports it. Split out of `slots.ts` to keep both files under 500 lines.

import type { Box, Point, Slot } from '../drag/slots.ts';
import { toned } from '../tones/tones.ts';

/** The indicator line's thickness. */
const LINE = 2;

/** Where the indicator's parts go inside the overlay, whose own corner is at `host`. */
export function placeIndicator(slot: Slot, host: Point): { line: Box | null; box: Box | null } {
  const { line, box } = slot;
  return {
    line: line && {
      left: line.x - host.x - (line.axis === 'y' ? LINE / 2 : 0),
      top: line.y - host.y - (line.axis === 'x' ? LINE / 2 : 0),
      width: line.axis === 'x' ? line.length : LINE,
      height: line.axis === 'y' ? line.length : LINE,
    },
    box: box && { ...box, left: box.left - host.x, top: box.top - host.y },
  };
}

/** The indicator in the frame's overlay (not part of the page, like the marks). */
export type Indicator = { show(slot: Slot | null): void; dispose(): void };

// The studio's selection colour (`toned`; custom properties reach into a shadow root); the
// system colour stands in until the studio has said its tones.
const COLOUR = 'var(--kv-select, Highlight)';

const SHEET = `
.line, .box { position: absolute; left: 0; top: 0; box-sizing: border-box; pointer-events: none; }
.line { background: ${COLOUR}; border-radius: ${LINE / 2}px; }
.box { outline: ${LINE}px solid ${COLOUR}; outline-offset: -${LINE}px; }
.off { display: none; }
@media (forced-colors: active) {
  .line { background: Highlight; }
  .box { outline-color: Highlight; }
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
  'z-index: 2147483646',
];
/** Inline and important, so no rule of the prototype moves or hides the overlay itself. */
const HOST_STYLE = HOST_RULES.map((rule) => `${rule} !important;`).join(' ');

type Layer = { host: HTMLElement; line: HTMLElement; box: HTMLElement };

function createLayer(document: Document): Layer {
  const host = document.createElement('kitvas-slot');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = HOST_STYLE;
  toned(host);
  const shadow = host.attachShadow({ mode: 'closed' });
  const sheet = document.createElement('style');
  sheet.textContent = SHEET;
  const box = document.createElement('div');
  box.className = 'box off';
  const line = document.createElement('div');
  line.className = 'line off';
  shadow.append(sheet, box, line);
  return { host, line, box };
}

function setBox(node: HTMLElement, box: Box | null): void {
  node.classList.toggle('off', box === null);
  if (!box) return;
  node.style.left = `${box.left}px`;
  node.style.top = `${box.top}px`;
  node.style.width = `${box.width}px`;
  node.style.height = `${box.height}px`;
}

/**
 * One line and one box in an overlay of their own at the end of `body`, inside a closed shadow
 * root, made on the first slot shown. The caller shows the slot again when the page scrolls.
 */
export function createIndicator(document: Document): Indicator {
  let layer: Layer | undefined;
  return {
    show(slot) {
      if (!slot) {
        if (!layer) return;
        setBox(layer.line, null);
        setBox(layer.box, null);
        return;
      }
      layer ??= createLayer(document);
      // A page that replaced its body's content took the overlay out with it.
      if (!layer.host.isConnected) document.body.append(layer.host);
      const corner = layer.host.getBoundingClientRect();
      const placed = placeIndicator(slot, { x: corner.left, y: corner.top });
      setBox(layer.line, placed.line);
      setBox(layer.box, placed.box);
    },
    dispose() {
      layer?.host.remove();
      layer = undefined;
    },
  };
}
