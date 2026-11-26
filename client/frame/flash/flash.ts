// The ring that flashes once on an element a change was just applied to (ADR 0057, motion). The
// studio names the elements (`flash` of `client/channel/protocol.ts`) when a change comes from a
// button or a key and not from the person's hand on the element: a variant, a suggestion, an undo
// or a redo. So the person sees where the change landed. The rings sit in one overlay at the end
// of `body`, inside a closed shadow root, as the marks do: the prototype's styles do not reach
// it, it never takes the pointer and it is hidden from assistive technology. A ring lives for
// FLASH_MS and removes itself; the overlay leaves the page with its last ring. Under reduced
// motion a ring does not grow or fade: it shows still for the same time.

import { flashIds, MAX_FLASH } from '../../channel/protocol.ts';
import { placeRing, type Rect } from '../drag/place.ts';
import { overlayHostStyle } from '../page/overlay-host.ts';
import { pageRect } from '../page/rect.ts';
import { toned } from '../tones/tones.ts';

/** How long a ring shows: the studio's `motion-flash` (a test holds the two together). */
export const FLASH_MS = 560;

/** How far the ring grows past the element, in CSS pixels. */
export const FLASH_REACH = 16;

// The studio's selection colour once it says its tones; the system's until then.
const SELECT = 'var(--kv-select, Highlight)';

export const FLASH_SHEET = `
.ring {
  position: absolute; left: 0; top: 0; box-sizing: border-box; pointer-events: none;
  outline: 2px solid transparent; outline-offset: 0;
  animation: flash ${FLASH_MS}ms ease-out forwards;
}
@keyframes flash {
  from { outline-color: ${SELECT}; box-shadow: 0 0 0 0 ${SELECT}; }
  to { outline-color: transparent; box-shadow: 0 0 0 ${FLASH_REACH}px transparent; }
}
@media (prefers-reduced-motion: reduce) {
  .ring { animation: none; outline-color: ${SELECT}; }
}
@media (forced-colors: active) {
  .ring { animation: none; outline-color: Highlight; }
}
`;

const HOST_STYLE = overlayHostStyle(2147483647);

export type Flash = {
  /** Flashes a ring once on every element with one of `ids` (each rendered copy of it). */
  show(ids: readonly string[]): void;
};

type Layer = { host: HTMLElement; rings: HTMLElement };

/** Made once and kept: the tones are set on this host, and it comes back for the next flash. */
function createLayer(): Layer {
  const host = document.createElement('kitvas-flash');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = HOST_STYLE;
  // After the host's own style: the tones are custom properties beside it.
  toned(host);
  const sheet = document.createElement('style');
  sheet.textContent = FLASH_SHEET;
  const rings = document.createElement('div');
  host.attachShadow({ mode: 'closed' }).append(sheet, rings);
  return { host, rings };
}

/** Every rendered element of `ids`, in the page's order: a list item shows once per copy. */
function elementsOf(ids: readonly string[]): Element[] {
  const wanted = new Set(ids);
  const found: Element[] = [];
  for (const element of document.querySelectorAll('[data-ks]')) {
    if (wanted.has(element.getAttribute('data-ks') ?? '')) found.push(element);
  }
  return found;
}

function ringAt(box: Rect, element: Element): HTMLElement {
  const ring = document.createElement('div');
  ring.className = 'ring';
  ring.style.left = `${box.left}px`;
  ring.style.top = `${box.top}px`;
  ring.style.width = `${box.width}px`;
  ring.style.height = `${box.height}px`;
  // The ring hugs a rounded element as its own edge does.
  ring.style.borderRadius = getComputedStyle(element).borderRadius;
  return ring;
}

export function createFlash(): Flash {
  let layer: Layer | undefined;

  return {
    show(ids) {
      const elements = elementsOf(flashIds(ids));
      if (elements.length === 0) return;
      layer ??= createLayer();
      const { host, rings } = layer;
      if (!host.isConnected) document.body.append(host);
      const at = pageRect(host);
      const pageWidth = document.documentElement.clientWidth;
      const shown: HTMLElement[] = [];
      for (const element of elements) {
        if (shown.length >= MAX_FLASH) break;
        // No ring for an element with no size, or outside the page's width.
        const box = placeRing(pageRect(element), at, pageWidth);
        if (box) shown.push(ringAt(box, element));
      }
      rings.append(...shown);
      // A timer, not `animationend`: under reduced motion nothing animates.
      setTimeout(
        () => {
          for (const ring of shown) ring.remove();
          if (rings.childElementCount === 0) host.remove();
        },
        shown.length > 0 ? FLASH_MS : 0,
      );
    },
  };
}
