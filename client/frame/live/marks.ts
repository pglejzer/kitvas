// The live marks the page asks for (spec 4c, goal 5; plan 16, task C): one numbered tag per
// element with a live finding, at the element's top-left corner, so it never sits on the full
// check's dots at the top-right. Like the full check's marks, everything is in one overlay at the
// end of `body`, in a closed shadow root, hidden from assistive technology and never taking the
// pointer. Colours are the studio's tones (`toned`), with system colours until it says them:
// nothing of the studio's look reaches a build.

import type { Point, Rect } from '../drag/place.ts';
import { toned } from '../tones/tones.ts';

/** One live mark as the page sends it. */
export type LiveMarkLike = { id: string; label: string; tone: 'fix' | 'review' };

/** The height of a tag, and the least width (a one-character label). */
export const LIVE_TAG = 20;

const SHEET = `
.tag {
  position: absolute; left: 0; top: 0; box-sizing: border-box; pointer-events: none;
  min-width: ${LIVE_TAG}px; height: ${LIVE_TAG}px; padding: 0 4px; border-radius: 4px;
  display: flex; align-items: center; justify-content: center; white-space: nowrap;
  font: 700 11px/1 system-ui, -apple-system, "Segoe UI", sans-serif; letter-spacing: 0;
  font-variant-numeric: tabular-nums;
  background: var(--kv-review, Canvas); color: var(--kv-on-tone, CanvasText);
  border: 2px dashed var(--kv-on-tone, CanvasText);
}
.tag[data-tone="fix"] {
  background: var(--kv-fix, CanvasText); color: var(--kv-on-tone, Canvas); border-style: solid;
}
.off { display: none; }
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

/**
 * Where a tag goes: centred on the element's top-left corner, moved right to stay inside the page
 * and down to stay below its top, and never past the page's right edge.
 */
export function placeTag(element: Rect, host: Point, pageWidth: number, width: number): Point {
  const right = Math.max(0, pageWidth - width);
  const left = Math.min(Math.max(0, element.left - LIVE_TAG / 2), right);
  const top = Math.max(0, element.top - LIVE_TAG / 2);
  return { left: left - host.left, top: top - host.top };
}

export type LiveMarks = {
  /** Draws `marks`, replacing the ones before; an empty list removes the overlay. */
  draw(marks: readonly LiveMarkLike[]): void;
};

type Tag = { id: string; element: Element; node: HTMLElement; width: number };

const pageRect = (element: Element): Rect => {
  const { left, top, width, height } = element.getBoundingClientRect();
  return { left: left + scrollX, top: top + scrollY, width, height };
};

/** The first element with each id: a tag goes on the first of the elements a loop rendered. */
function firstById(): Map<string, Element> {
  const found = new Map<string, Element>();
  for (const element of document.querySelectorAll('[data-ks]')) {
    const id = element.getAttribute('data-ks') ?? '';
    if (!found.has(id)) found.set(id, element);
  }
  return found;
}

export function createLiveMarks(): LiveMarks {
  let host: HTMLElement | undefined;
  let layer: HTMLElement | undefined;
  let tags: Tag[] = [];
  let frame = 0;
  const observer =
    typeof ResizeObserver === 'function' ? new ResizeObserver(() => schedule()) : undefined;

  function update(): void {
    if (!host) return;
    const box = pageRect(host);
    const origin = { left: box.left, top: box.top };
    const pageWidth = document.documentElement.clientWidth;
    for (const tag of tags) {
      // React may have replaced the element; the id finds its successor.
      if (!tag.element.isConnected) {
        const again = firstById().get(tag.id);
        if (again) {
          tag.element = again;
          observer?.observe(again);
        }
      }
      const rect = pageRect(tag.element);
      const shown = tag.element.isConnected && (rect.width > 0 || rect.height > 0);
      tag.node.classList.toggle('off', !shown);
      if (!shown) continue;
      const point = placeTag(rect, origin, pageWidth, tag.width);
      tag.node.style.left = `${point.left}px`;
      tag.node.style.top = `${point.top}px`;
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

  function clear(): void {
    observer?.disconnect();
    for (const tag of tags) tag.node.remove();
    tags = [];
  }

  function open(): HTMLElement {
    if (layer) return layer;
    host = document.createElement('kitvas-live-marks');
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
    draw(marks) {
      clear();
      if (marks.length === 0) {
        if (host) unlisten();
        host?.remove();
        host = undefined;
        layer = undefined;
        return;
      }
      const root = open();
      const elements = firstById();
      for (const mark of marks) {
        const element = elements.get(mark.id);
        // A mark whose element is not on the page is skipped.
        if (!element) continue;
        const node = document.createElement('div');
        node.className = 'tag';
        node.dataset.tone = mark.tone;
        // Text only: a label is never read as markup.
        node.textContent = mark.label;
        root.append(node);
        tags.push({ id: mark.id, element, node, width: LIVE_TAG });
      }
      // One layout for every width, after each tag is in place.
      for (const tag of tags) tag.width = tag.node.offsetWidth || LIVE_TAG;
      observer?.observe(document.documentElement);
      for (const tag of tags) observer?.observe(tag.element);
      update();
    },
  };
}
