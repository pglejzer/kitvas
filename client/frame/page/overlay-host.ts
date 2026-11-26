// The parts the frame's overlays share: the inline style of a host element (a zero-size box at the
// page's top-left corner that never takes the pointer and lets its children overflow), the first
// element of each id, and a node's place. Each overlay has its own z-index, so the layers keep one
// order.

const HOST_RULES = [
  'all: initial',
  'position: absolute',
  'left: 0',
  'top: 0',
  'width: 0',
  'height: 0',
  'overflow: visible',
  'pointer-events: none',
];

/** Inline and important, so no rule of the prototype moves or hides the overlay itself. */
export const overlayHostStyle = (zIndex: number): string =>
  [...HOST_RULES, `z-index: ${zIndex}`].map((rule) => `${rule} !important;`).join(' ');

/** The first element with each id: a mark or pin goes on the first of the elements a loop rendered. */
export function firstById(): Map<string, Element> {
  const found = new Map<string, Element>();
  for (const element of document.querySelectorAll('[data-ks]')) {
    const id = element.getAttribute('data-ks') ?? '';
    if (!found.has(id)) found.set(id, element);
  }
  return found;
}

/** Puts a node at `left`, `top` (px) inside its overlay. */
export function setPlace(node: HTMLElement, left: number, top: number): void {
  node.style.left = `${left}px`;
  node.style.top = `${top}px`;
}
