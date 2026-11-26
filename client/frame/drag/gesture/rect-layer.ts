// The selection rectangle's overlay (ADRs 0059 and 0066): the rectangle while it is pulled and an
// outline around every copy it would take, in an overlay of its own at the end of `body`, inside
// a closed shadow root. Boxes are the frame's viewport pixels; the rules are in `rect.ts`.

import { toned } from '../../tones/tones.ts';
import type { Box } from '../slots/slots.ts';

/** The most outlines a rectangle draws for what it would take. */
export const MAX_OUTLINES = 200;

const HOST_RULES = [
  'all: initial',
  'position: fixed',
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

// The colour is the studio's selection colour (`toned`; custom properties reach into a shadow
// root); the system colour stands in until the studio has said its tones.
const SHEET = `
.rect, .take { position: absolute; left: 0; top: 0; box-sizing: border-box; pointer-events: none; }
.rect { border: 1px solid var(--kv-select, Highlight); }
.rect::before {
  content: ''; position: absolute; inset: 0; opacity: 0.1;
  background: var(--kv-select, Highlight);
}
.take { outline: 2px solid var(--kv-select, Highlight); outline-offset: -2px; }
.off { display: none; }
`;

type Layer = { host: HTMLElement; root: ShadowRoot; rect: HTMLElement; takes: HTMLElement[] };

export type RectLayer = {
  /**
   * The rectangle and an outline around each box it would take; `null` takes both away. `zoom`:
   * frame pixels per pixel on the screen, so the lines keep their width at any canvas zoom.
   */
  draw(rect: Box | null, boxes: readonly Box[], zoom: number): void;
};

function setBox(node: HTMLElement, box: Box): void {
  node.style.left = `${box.left}px`;
  node.style.top = `${box.top}px`;
  node.style.width = `${box.width}px`;
  node.style.height = `${box.height}px`;
}

function createLayer(): Layer {
  const host = document.createElement('kitvas-drag');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = HOST_STYLE;
  toned(host);
  const sheet = document.createElement('style');
  sheet.textContent = SHEET;
  const rect = document.createElement('div');
  rect.className = 'rect';
  const root = host.attachShadow({ mode: 'closed' });
  root.append(sheet, rect);
  document.body.append(host);
  return { host, root, rect, takes: [] };
}

/** The overlay is made when a rectangle is first drawn and leaves the page when it ends. */
export function createRectLayer(): RectLayer {
  let layer: Layer | undefined;
  return {
    draw(rect, boxes, zoom) {
      if (!rect) {
        layer?.host.remove();
        layer = undefined;
        return;
      }
      layer ??= createLayer();
      setBox(layer.rect, rect);
      layer.rect.style.borderWidth = `${zoom}px`;
      const shown = boxes.slice(0, MAX_OUTLINES);
      while (layer.takes.length < shown.length) {
        const take = document.createElement('div');
        layer.root.append(take);
        layer.takes.push(take);
      }
      for (const [index, take] of layer.takes.entries()) {
        const box = shown[index];
        take.className = box ? 'take' : 'take off';
        if (!box) continue;
        setBox(take, box);
        take.style.outlineWidth = `${2 * zoom}px`;
        take.style.outlineOffset = `${-2 * zoom}px`;
      }
    },
  };
}
