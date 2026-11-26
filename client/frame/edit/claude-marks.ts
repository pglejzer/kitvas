// Claude's mark on the canvas (spec 18e, D): around each element Claude looks at or works on, a dashed
// ring in the selection tone, 2 px outside the element, and under its bottom right corner a small
// tag with the logo's loose part (a small rounded square, turned) and the word the studio sends
// (`label`: no text for people lives in the frame). A mark that `motion` marks is one Claude works
// on: the dashes run along the ring and the part sways from its turn to +10 degrees and back, with
// the period of the bar logo's working sign (ADR 0084); a still mark is one Claude only looks at or
// has not taken yet. Under reduced motion both stand still.
//
// Everything sits in one overlay at the end of `body`, inside a closed shadow root, as the marks
// of `page/marks.ts` do: the prototype's styles do not reach it, it never takes the pointer and
// it is hidden from assistive technology. It is placed again once per animation frame on scroll,
// resize, size change and any change of the page (a build swapped in). No new colour: the
// selection tone the studio says (`toned`), the system's until then.
//
// The period and the part are the studio's own: `LOGO_SWAY_MS` of `skin/logo.ts`, and `PART_D` with
// its turn `PART_TURN` of `brand/part.ts` (ADR 0080).

import { PART_D, PART_TURN } from '../../../src/studio/pages/brand/part.ts';
import { LOGO_SWAY_MS } from '../../../src/studio/pages/skin/logo.ts';
import type { ClaudeMark } from '../../channel/edit-protocol.ts';
import { type Point, placeRing, type Rect } from '../drag/place.ts';
import { overlayHostStyle } from '../page/overlay-host.ts';
import { pageRect } from '../page/rect.ts';
import { toned } from '../tones/tones.ts';

/** Between the element's box and the ring's outer edge, in CSS pixels. */
const REACH = 2;
/** The ring's stroke width and dash pattern (period 10 units: the offset runs one period). */
const STROKE = 2;
const DASH = '6 4';
const DASH_PERIOD = 10;
/** Between the tag and the element's box. */
const TAG_GAP = 4;
/** The part's drawing in the tag: its 7 unit square on a 10 unit view, so about 8 px wide. */
const PART_SIZE = 12;
/** Where the part sways to, in degrees; it starts and ends at `PART_TURN`. */
const SWAY_TO = 10;

const SHEET = `
.ring { position: absolute; left: 0; top: 0; overflow: visible; pointer-events: none; }
.ring rect {
  fill: none; stroke: var(--kv-select, Highlight); stroke-width: ${STROKE};
  stroke-dasharray: ${DASH};
}
.tag {
  position: absolute; left: 0; top: 0; box-sizing: border-box; pointer-events: none;
  display: flex; align-items: center; gap: 4px; padding: 2px 6px 2px 5px; border-radius: 4px;
  font: 600 11px/14px system-ui, -apple-system, "Segoe UI", sans-serif; white-space: nowrap;
  letter-spacing: 0; background: var(--kv-select, Highlight); color: var(--kv-on-select, HighlightText);
}
.tag svg { display: block; width: ${PART_SIZE}px; height: ${PART_SIZE}px; fill: currentColor; }
.tag path {
  transform: rotate(${PART_TURN}deg); transform-box: fill-box; transform-origin: center;
}
.off { display: none; }
.ring[data-motion] rect { animation: dash ${LOGO_SWAY_MS}ms linear infinite; }
.tag[data-motion] path { animation: sway ${LOGO_SWAY_MS}ms ease-in-out infinite; }
@keyframes dash { to { stroke-dashoffset: -${DASH_PERIOD}; } }
@keyframes sway { 50% { transform: rotate(${SWAY_TO}deg); } }
@media (prefers-reduced-motion: reduce) {
  .ring[data-motion] rect, .tag[data-motion] path { animation: none; }
}
@media (forced-colors: active) {
  .ring rect { stroke: Highlight; }
  .tag { background: Highlight; color: HighlightText; }
}
`;

const HOST_STYLE = overlayHostStyle(2147483645);

/** More marks than this are not drawn: a mapped list of thousands stays cheap to follow. */
const MAX_DRAWN = 200;

const SVG = 'http://www.w3.org/2000/svg';

/**
 * Where a tag goes, in page coordinates: right-aligned with the box, 4 px under it, or inside the
 * box's bottom edge when the page ends there; kept inside the page's width.
 */
export function placeTag(
  box: Rect,
  tag: { width: number; height: number },
  view: { width: number; height: number },
): Point {
  const right = Math.min(box.left + box.width, view.width);
  const left = Math.max(0, Math.min(right - tag.width, view.width - tag.width));
  const bottom = box.top + box.height;
  const under = bottom + TAG_GAP;
  const top = under + tag.height <= view.height ? under : bottom - tag.height - TAG_GAP;
  return { left, top };
}

export type ClaudeMarks = {
  /** Draws `marks`, replacing the ones drawn before; none removes the overlay. */
  set(label: string, marks: readonly ClaudeMark[]): void;
};

type Drawn = { ring: SVGSVGElement; rect: SVGRectElement; tag: HTMLElement };
type Layer = { host: HTMLElement; root: HTMLElement };
type Target = { element: Element; motion: boolean };

/** The elements the marks go on, in the marks' order: every copy of an id, or the one copy. */
function resolve(marks: readonly ClaudeMark[]): Target[] {
  const wanted = new Set(marks.map((mark) => mark.id));
  const byId = new Map<string, Element[]>();
  for (const element of document.querySelectorAll('[data-ks]')) {
    const id = element.getAttribute('data-ks') ?? '';
    if (!wanted.has(id)) continue;
    const list = byId.get(id);
    if (list) list.push(element);
    else byId.set(id, [element]);
  }
  const found: Target[] = [];
  for (const mark of marks) {
    const copies = byId.get(mark.id) ?? [];
    // A copy the page has not (any more) gets no mark; never another one.
    const own = mark.item === undefined ? copies : copies.slice(mark.item, mark.item + 1);
    for (const element of own) found.push({ element, motion: mark.motion });
  }
  return found.slice(0, MAX_DRAWN);
}

function part(): SVGSVGElement {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '-5 -5 10 10');
  const path = document.createElementNS(SVG, 'path');
  path.setAttribute('d', PART_D);
  svg.append(path);
  return svg;
}

function draw(label: string): Drawn {
  const ring = document.createElementNS(SVG, 'svg');
  ring.setAttribute('class', 'ring');
  const rect = document.createElementNS(SVG, 'rect');
  ring.append(rect);
  const tag = document.createElement('div');
  tag.className = 'tag';
  const word = document.createElement('span');
  // Text only: a label is never read as markup.
  word.textContent = label;
  tag.append(part(), word);
  return { ring, rect, tag };
}

export function createClaudeMarks(): ClaudeMarks {
  let layer: Layer | undefined;
  let wanted: readonly ClaudeMark[] = [];
  let word = '';
  let drawn: Drawn[] = [];
  let frame = 0;
  let observed = new WeakSet<Element>();
  const resizes =
    typeof ResizeObserver === 'function' ? new ResizeObserver(() => schedule()) : undefined;
  // A build swapped in replaces elements without resizing anything observed.
  const changes =
    typeof MutationObserver === 'function' ? new MutationObserver(() => schedule()) : undefined;

  function build(count: number): void {
    if (!layer) return;
    drawn = Array.from({ length: count }, () => draw(word));
    layer.root.replaceChildren(...drawn.flatMap((one) => [one.ring, one.tag]));
  }

  /** Puts every ring and tag where its element is now. */
  function update(): void {
    if (!layer) return;
    const targets = resolve(wanted);
    if (targets.length !== drawn.length) build(targets.length);
    const at = pageRect(layer.host);
    const width = document.documentElement.clientWidth;
    const height = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
    for (const [index, target] of targets.entries()) {
      const one = drawn[index];
      if (!one) continue;
      if (resizes && !observed.has(target.element)) {
        observed.add(target.element);
        resizes.observe(target.element);
      }
      const box = placeRing(pageRect(target.element), { left: 0, top: 0 }, width);
      for (const part of [one.ring, one.tag]) part.classList.toggle('off', box === undefined);
      one.ring.toggleAttribute('data-motion', target.motion);
      one.tag.toggleAttribute('data-motion', target.motion);
      if (!box) continue;
      const out = REACH + STROKE;
      one.ring.style.left = `${box.left - out - at.left}px`;
      one.ring.style.top = `${box.top - out - at.top}px`;
      one.ring.setAttribute('width', String(box.width + 2 * out));
      one.ring.setAttribute('height', String(box.height + 2 * out));
      // The stroke is centred on the rect: its inner edge is REACH outside the element.
      one.rect.setAttribute('x', String(STROKE / 2));
      one.rect.setAttribute('y', String(STROKE / 2));
      one.rect.setAttribute('width', String(box.width + 2 * out - STROKE));
      one.rect.setAttribute('height', String(box.height + 2 * out - STROKE));
      const place = placeTag(
        box,
        { width: one.tag.offsetWidth, height: one.tag.offsetHeight },
        { width, height },
      );
      one.tag.style.left = `${place.left - at.left}px`;
      one.tag.style.top = `${place.top - at.top}px`;
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
    document.addEventListener('scroll', schedule, { capture: true, passive: true });
    window.addEventListener('resize', schedule);
    window.addEventListener('load', schedule);
    resizes?.observe(document.documentElement);
    resizes?.observe(document.body);
    changes?.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'hidden'],
    });
  }

  function unlisten(): void {
    document.removeEventListener('scroll', schedule, { capture: true });
    window.removeEventListener('resize', schedule);
    window.removeEventListener('load', schedule);
    resizes?.disconnect();
    changes?.disconnect();
    observed = new WeakSet();
    cancelAnimationFrame(frame);
    frame = 0;
  }

  function createLayer(): Layer {
    const host = document.createElement('kitvas-claude');
    host.setAttribute('aria-hidden', 'true');
    host.style.cssText = HOST_STYLE;
    toned(host);
    const shadow = host.attachShadow({ mode: 'closed' });
    const sheet = document.createElement('style');
    sheet.textContent = SHEET;
    const root = document.createElement('div');
    shadow.append(sheet, root);
    document.body.append(host);
    return { host, root };
  }

  return {
    set(label, marks) {
      wanted = marks;
      word = label;
      if (marks.length === 0) {
        if (layer) {
          layer.host.remove();
          unlisten();
        }
        layer = undefined;
        drawn = [];
        return;
      }
      if (!layer) {
        layer = createLayer();
        listen();
        document.fonts?.ready.then(schedule, () => undefined);
      }
      // A new word or new marks: drawn again from nothing, then placed.
      build(0);
      update();
    },
  };
}
