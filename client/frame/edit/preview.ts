// The optimistic preview (plan 13, task E2): an edit shows in the prototype at once, before the
// build confirms it. The preview changes the page's own elements, so everything it touches is
// remembered the first time and put back exactly by `clear`: the text node's text, and the `style`
// and `class` attributes as they were written, also when they were not there at all.
//
// A change goes to every element with the id: the items of a mapped list share one. A change with
// `item` goes to that copy only (the copy `copyAt` of `items.ts` names).

import type { PreviewChange } from '../../channel/edit-protocol.ts';

const TEXT_NODE = 3;

/** The part of an element the preview uses; a DOM element fits it, and so does a test's fake. */
export type PreviewElement = {
  childNodes: ArrayLike<{ nodeType: number; nodeValue: string | null }>;
  style: { setProperty(property: string, value: string): void };
  classList: { toggle(name: string, force?: boolean): boolean };
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
};

type TextNode = PreviewElement['childNodes'][number];

/** What an element held before its first preview; only the parts a preview touched are set. */
type Original = {
  text?: { node: TextNode; value: string | null };
  /** The attribute as written; `null`: there was none. */
  style?: { kept: string | null };
  classes?: { kept: string | null };
};

export type Preview = {
  /** Shows `changes` on every element with each id, on top of the previews already shown. */
  apply(changes: PreviewChange[]): void;
  /** Takes every preview back: the elements are as they were before the first `apply`. */
  clear(): void;
};

/** The element's text node when its children are exactly one text node. */
function onlyText(element: PreviewElement): TextNode | undefined {
  if (element.childNodes.length !== 1) return undefined;
  const node = element.childNodes[0];
  return node && node.nodeType === TEXT_NODE ? node : undefined;
}

function putBack(element: PreviewElement, name: 'style' | 'class', kept: string | null): void {
  // Written first: Chrome keeps a style changed through the CSSOM after `removeAttribute` unless
  // the attribute is set. The class attribute goes the same way, so it is the same text again.
  element.setAttribute(name, kept ?? '');
  if (kept === null) element.removeAttribute(name);
}

/** The preview over any way of finding elements by id; `createPreview` uses the document. */
export function createPreviewOver(find: (id: string) => Iterable<PreviewElement>): Preview {
  const originals = new Map<PreviewElement, Original>();

  function originalOf(element: PreviewElement): Original {
    let original = originals.get(element);
    if (!original) {
      original = {};
      originals.set(element, original);
    }
    return original;
  }

  function show(element: PreviewElement, change: PreviewChange): void {
    if (change.kind === 'text') {
      // The node's own text is set: React holds this node, and a new one would be lost to it.
      const node = onlyText(element);
      if (!node) return;
      const original = originalOf(element);
      // Kept once: a second preview must not take the first preview for the original.
      original.text ??= { node, value: node.nodeValue };
      node.nodeValue = change.value;
      return;
    }
    const original = originalOf(element);
    if (change.kind === 'style') {
      original.style ??= { kept: element.getAttribute('style') };
      element.style.setProperty(change.property, change.value);
      return;
    }
    original.classes ??= { kept: element.getAttribute('class') };
    element.classList.toggle(change.className, change.on);
  }

  return {
    apply(changes) {
      for (const change of changes) {
        // `item`: that copy only, counted in the order `find` gives them (the page's order).
        if (change.item === undefined) {
          for (const element of find(change.id)) show(element, change);
          continue;
        }
        const copy = [...find(change.id)][change.item];
        if (copy) show(copy, change);
      }
    },

    clear() {
      for (const [element, original] of originals) {
        if (original.text) original.text.node.nodeValue = original.text.value;
        if (original.style) putBack(element, 'style', original.style.kept);
        if (original.classes) putBack(element, 'class', original.classes.kept);
      }
      originals.clear();
    },
  };
}

/** Every element of the page with the id. */
function byId(id: string): Iterable<PreviewElement> {
  return document.querySelectorAll<HTMLElement | SVGElement>(`[data-ks="${CSS.escape(id)}"]`);
}

export function createPreview(): { apply(changes: PreviewChange[]): void; clear(): void } {
  return createPreviewOver(byId);
}
