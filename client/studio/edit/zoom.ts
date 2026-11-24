// Zoom and pan of the frame box (spec 4b, decision 13; plan 14, task D7): a CSS scale of the box, never of
// the frame's width; Ctrl+wheel, pinch, Ctrl+0, Ctrl+1, Space+drag, the middle button.
//
// The box is scaled where it stands, not moved into a wrapper: moving an iframe in the DOM reloads
// it. Margins make the box take the room of its scaled size, so the stage scrolls.

import type { EditorContext } from './context.ts';
import { el } from './controls.ts';
import { text } from './texts.ts';

export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 2;
const STEP = 0.25;
/** The inline styles the zoom sets on the box, removed again at 100 %. */
const OWN_STYLES = ['transform', 'transform-origin', 'margin', 'max-width', 'overflow', 'width'];

/** A zoom inside the range, to whole percents; a bad number is 100 %. */
export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return 1;
  return Math.round(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom)) * 100) / 100;
}

/** The next quarter step in `direction`: 100 % up is 125 %, 110 % up is 125 %, down is 100 %. */
export function stepZoom(zoom: number, direction: 1 | -1): number {
  const quarters = zoom / STEP;
  const next = direction === 1 ? Math.floor(quarters + 1e-9) + 1 : Math.ceil(quarters - 1e-9) - 1;
  return clampZoom(next * STEP);
}

/** The zoom after a Ctrl+wheel or pinch of `deltaY`: a trackpad pinch sends small steps. */
export function wheelZoom(zoom: number, deltaY: number): number {
  return clampZoom(zoom * Math.exp(-deltaY * 0.002));
}

/** The zoom that shows the whole frame width in the stage, rounded down so it never overflows. */
export function fitZoom(stageWidth: number, frameWidth: number): number {
  if (!(stageWidth > 0) || !(frameWidth > 0)) return 1;
  return clampZoom(Math.floor((stageWidth / frameWidth) * 100) / 100);
}

/** The scroll that keeps the content point under `pointer` still when zoom goes `from` to `to`. */
export function scrollFor(scroll: number, pointer: number, from: number, to: number): number {
  return Math.max(0, ((scroll + pointer) * to) / from - pointer);
}

/** Whether a key press is meant for a field, which keeps Space and the digits to itself. */
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(target.tagName);
}

const percent = (zoom: number): string => `${Math.round(zoom * 100)}%`;

function button(label: string, shown: string, onClick: () => void): HTMLButtonElement {
  const node = el('button', undefined, shown);
  node.type = 'button';
  node.setAttribute('aria-label', label);
  node.addEventListener('click', onClick);
  return node;
}

export function mountZoom(ctx: EditorContext): void {
  const strip = ctx.panel.querySelector<HTMLElement>('[data-edit="zoom"]');
  const frame = ctx.bridge.frame.element;
  const box = frame.closest<HTMLElement>('.frame-box') ?? frame;
  const stage = frame.closest<HTMLElement>('.stage');
  const { store } = ctx;

  function setZoom(next: number, pointer?: { x: number; y: number }): void {
    const from = store.get().zoom;
    const to = clampZoom(next);
    if (to === from) return;
    store.set({ zoom: to });
    if (!stage || !pointer) return;
    const rect = stage.getBoundingClientRect();
    stage.scrollLeft = scrollFor(stage.scrollLeft, pointer.x - rect.left, from, to);
    stage.scrollTop = scrollFor(stage.scrollTop, pointer.y - rect.top, from, to);
  }

  const fit = (): void => setZoom(fitZoom(stage?.clientWidth ?? 0, frame.offsetWidth));

  function apply(zoom: number): void {
    const style = box.style;
    if (zoom === 1) {
      for (const name of OWN_STYLES) style.removeProperty(name);
      stage?.removeAttribute('data-zoomed');
      return;
    }
    // The box must be as wide as its frame, or it would scroll inside itself under the scale.
    style.maxWidth = 'none';
    style.overflow = 'visible';
    style.width = 'max-content';
    style.margin = '0';
    style.transformOrigin = '0 0';
    style.transform = `scale(${zoom})`;
    // The layout size is unscaled; the margins add or take away the difference.
    style.marginRight = `${(zoom - 1) * box.offsetWidth}px`;
    style.marginBottom = `${(zoom - 1) * box.offsetHeight}px`;
    stage?.setAttribute('data-zoomed', '');
  }

  if (strip) {
    const level = button(text('zoom.reset'), percent(1), () => setZoom(1));
    level.className = 'zoom-level';
    const out = button(text('zoom.out'), '−', () => setZoom(stepZoom(store.get().zoom, -1)));
    const more = button(text('zoom.in'), '+', () => setZoom(stepZoom(store.get().zoom, 1)));
    const fitting = button(text('zoom.fit.label'), text('zoom.fit'), fit);
    strip.replaceChildren(el('span', 'zoom-label', text('zoom.label')), out, level, more, fitting);
    store.subscribe((state, previous) => {
      if (state.zoom === previous.zoom) return;
      level.textContent = percent(state.zoom);
      out.disabled = state.zoom <= MIN_ZOOM;
      more.disabled = state.zoom >= MAX_ZOOM;
    });
  }
  store.subscribe((state, previous) => {
    if (state.zoom !== previous.zoom) apply(state.zoom);
  });

  if (!stage) return;
  // A pinch arrives as a wheel with `ctrlKey`; the page's own zoom must not take it.
  stage.addEventListener(
    'wheel',
    (event) => {
      if (!event.ctrlKey || !store.get().on) return;
      event.preventDefault();
      setZoom(wheelZoom(store.get().zoom, event.deltaY), { x: event.clientX, y: event.clientY });
    },
    { passive: false },
  );

  document.addEventListener('keydown', (event) => {
    if (!store.get().on) return;
    if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey) {
      if (event.key === '0') {
        event.preventDefault();
        fit();
      } else if (event.key === '1') {
        event.preventDefault();
        setZoom(1);
      }
      return;
    }
    if (event.code === 'Space' && !isTyping(event.target)) {
      event.preventDefault();
      stage.setAttribute('data-pan', '');
    }
  });
  const release = (): void => stage.removeAttribute('data-pan');
  document.addEventListener('keyup', (event) => {
    if (event.code === 'Space') release();
  });
  window.addEventListener('blur', release);

  let last: { x: number; y: number } | null = null;
  // The middle button would start the browser's own auto-scroll.
  stage.addEventListener('mousedown', (event) => {
    if (event.button === 1) event.preventDefault();
  });
  stage.addEventListener('pointerdown', (event) => {
    const space = stage.hasAttribute('data-pan') && event.button === 0;
    if (!space && event.button !== 1) return;
    event.preventDefault();
    stage.setPointerCapture(event.pointerId);
    stage.setAttribute('data-panning', '');
    last = { x: event.clientX, y: event.clientY };
  });
  stage.addEventListener('pointermove', (event) => {
    if (!last) return;
    stage.scrollLeft -= event.clientX - last.x;
    stage.scrollTop -= event.clientY - last.y;
    last = { x: event.clientX, y: event.clientY };
  });
  const stop = (): void => {
    last = null;
    stage.removeAttribute('data-panning');
  };
  stage.addEventListener('pointerup', stop);
  stage.addEventListener('pointercancel', stop);
}
