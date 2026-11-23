// Runs in the main frame of the page: fixed or sticky elements that cover a large part of the
// window (cookie banners, dialogs, chat panels). They hide the page behind them, so the facts name
// them and the candidates inside them come last.
//
// Everything here is serialized into the page: it uses no name from outside the function.

export type OverlayOptions = {
  /** The share of the window's area an element must cover, 0 to 1. */
  share: number;
  max: number;
  textMax: number;
  elementsMax: number;
};

export type FrameOverlay = { box: [number, number, number, number]; text: string };

export function findOverlays(options: OverlayOptions): FrameOverlay[] {
  const { share, max, textMax, elementsMax } = options;
  const area = window.innerWidth * window.innerHeight;
  const found: { element: Element; overlay: FrameOverlay }[] = [];
  for (const element of Array.from(document.querySelectorAll('body *')).slice(0, elementsMax)) {
    if (found.length >= max) break;
    const position = getComputedStyle(element).position;
    if (position !== 'fixed' && position !== 'sticky') continue;
    // A fixed element inside an overlay is part of it.
    if (found.some((other) => other.element.contains(element))) continue;
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) continue;
    if (!element.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
    const width = Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0);
    const height = Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0);
    if (width <= 0 || height <= 0 || (width * height) / area < share) continue;
    found.push({
      element,
      overlay: {
        box: [
          Math.round(rect.left + window.scrollX),
          Math.round(rect.top + window.scrollY),
          Math.round(rect.width),
          Math.round(rect.height),
        ],
        text: (element.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, textMax),
      },
    });
  }
  return found.map((entry) => entry.overlay);
}
