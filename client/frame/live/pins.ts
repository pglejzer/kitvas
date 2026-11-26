// Note pins in the frame (spec 4d, goal 3; plan 17, task C): a small numbered pin on each noted
// element, apart from the live marks: at the element's bottom-left corner, where neither the live
// tags (top-left) nor the full check's dots (top-right) sit. Like them, everything is in one
// overlay at the end of `body`, in a closed shadow root, hidden from assistive technology and
// never taking the pointer; the studio's tones (`toned`) over system colours. The page sends the
// pins; nothing of a note is ever in a build or a draft file.

import type { NotePin } from '../../channel/live-protocol.ts';
import type { Point, Rect } from '../drag/place.ts';
import { firstById, overlayHostStyle } from '../page/overlay-host.ts';
import { pageRect } from '../page/rect.ts';
import { toned } from '../tones/tones.ts';

export type Pins = { set(pins: readonly NotePin[]): void; clear(): void };

/** The height of a pin, and the least width (a one-character label). */
export const PIN = 18;

const SHEET = `
.pin {
  position: absolute; left: 0; top: 0; box-sizing: border-box; pointer-events: none;
  min-width: ${PIN}px; height: ${PIN}px; padding: 0 4px; border-radius: ${PIN / 2}px;
  display: flex; align-items: center; justify-content: center; white-space: nowrap;
  font: 700 10px/1 system-ui, -apple-system, "Segoe UI", sans-serif; letter-spacing: 0;
  font-variant-numeric: tabular-nums;
  background: var(--kv-select, Mark); color: var(--kv-on-select, MarkText);
  border: 1px solid var(--kv-on-select, CanvasText);
}
.off { display: none; }
`;

const HOST_STYLE = overlayHostStyle(2147483644);

/**
 * Where a pin goes: centred on the element's bottom-left corner, moved right to stay inside the
 * page and down to stay below its top, and never past the page's right edge.
 */
export function placePin(element: Rect, host: Point, pageWidth: number, width: number): Point {
  const right = Math.max(0, pageWidth - width);
  const left = Math.min(Math.max(0, element.left - PIN / 2), right);
  const top = Math.max(0, element.top + element.height - PIN / 2);
  return { left: left - host.left, top: top - host.top };
}

type Pinned = { id: string; element: Element; node: HTMLElement; width: number };

export function createPins(): Pins {
  let host: HTMLElement | undefined;
  let layer: HTMLElement | undefined;
  let pinned: Pinned[] = [];
  let frame = 0;
  const observer =
    typeof ResizeObserver === 'function' ? new ResizeObserver(() => schedule()) : undefined;

  function update(): void {
    if (!host) return;
    const box = pageRect(host);
    const origin = { left: box.left, top: box.top };
    const pageWidth = document.documentElement.clientWidth;
    for (const pin of pinned) {
      // React may have replaced the element; the id finds its successor.
      if (!pin.element.isConnected) {
        const again = firstById().get(pin.id);
        if (again) {
          pin.element = again;
          observer?.observe(again);
        }
      }
      const rect = pageRect(pin.element);
      const shown = pin.element.isConnected && (rect.width > 0 || rect.height > 0);
      pin.node.classList.toggle('off', !shown);
      if (!shown) continue;
      const point = placePin(rect, origin, pageWidth, pin.width);
      pin.node.style.left = `${point.left}px`;
      pin.node.style.top = `${point.top}px`;
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
  }

  function unlisten(): void {
    document.removeEventListener('scroll', schedule, { capture: true });
    window.removeEventListener('resize', schedule);
  }

  function empty(): void {
    observer?.disconnect();
    for (const pin of pinned) pin.node.remove();
    pinned = [];
  }

  function close(): void {
    empty();
    if (host) unlisten();
    host?.remove();
    host = undefined;
    layer = undefined;
  }

  function open(): HTMLElement {
    if (layer) return layer;
    host = document.createElement('kitvas-note-pins');
    host.setAttribute('aria-hidden', 'true');
    host.style.cssText = HOST_STYLE;
    toned(host);
    const shadow = host.attachShadow({ mode: 'closed' });
    const sheet = document.createElement('style');
    sheet.textContent = SHEET;
    layer = document.createElement('div');
    shadow.append(sheet, layer);
    document.body.append(host);
    listen();
    return layer;
  }

  return {
    set(pins) {
      empty();
      if (pins.length === 0) {
        close();
        return;
      }
      const root = open();
      const elements = firstById();
      for (const pin of pins) {
        const element = elements.get(pin.id);
        // A pin whose element is not on the page is skipped.
        if (!element) continue;
        const node = document.createElement('div');
        node.className = 'pin';
        // Text only: a label is never read as markup.
        node.textContent = pin.label;
        root.append(node);
        pinned.push({ id: pin.id, element, node, width: PIN });
      }
      for (const pin of pinned) pin.width = pin.node.offsetWidth || PIN;
      observer?.observe(document.documentElement);
      for (const pin of pinned) observer?.observe(pin.element);
      update();
    },
    clear: close,
  };
}
