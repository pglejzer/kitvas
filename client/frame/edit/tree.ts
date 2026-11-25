// What the editor asks a frame about its elements: the layers tree and one element's computed
// styles. The logic is pure (`buildTree`, `nameOf`, `readStyles` take plain values); the functions
// at the end read the page and hand it to them.

import {
  MAX_NAME,
  MAX_NODES,
  MAX_STYLE_VALUE,
  parseEditFrame,
  type TreeNode,
} from '../../channel/edit-protocol.ts';
import { cut } from '../page/snapshot.ts';

/**
 * The properties the editor shows. A copy of `STYLE_PROPERTIES` in `src/edit/domain/types.ts`:
 * code bundled into a prototype imports no value from `src/`. A test keeps the two equal.
 */
export const STYLE_PROPERTIES = [
  'padding',
  'padding-block',
  'padding-inline',
  'margin',
  'margin-block',
  'margin-inline',
  'gap',
  'color',
  'background-color',
  'border-color',
  'font-size',
  'font-weight',
  'line-height',
  'border-radius',
  'border-width',
  'width',
  'height',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'display',
  'flex-direction',
  'flex-wrap',
  'justify-content',
  'align-items',
  'align-self',
  'text-align',
  'border-style',
  'outline-color',
  'outline-width',
  'outline-style',
  'background-image',
  'background-size',
  'min-width',
  'min-height',
] as const;

const ATTRIBUTE = 'data-ks';
const HEADINGS = 'h1, h2, h3, h4, h5, h6';

/** What the page gives for one `[data-ks]` element. The functions are read only when needed. */
export type RawNode = {
  id: string;
  tag: string;
  /** The element's `aria-label`. */
  label: string | null;
  /** The text of the first heading inside the element. */
  heading(): string | null;
  /** The element's text. */
  text(): string | null;
  /** The ids of the enclosing `[data-ks]` elements, the nearest first. */
  ancestors(): readonly string[];
};

const tidy = (raw: string | null): string =>
  cut((raw ?? '').replace(/\s+/g, ' ').trim(), MAX_NAME).trimEnd();

/** A layer's name: its label, else its first heading, else its text, else its tag. */
export function nameOf(raw: Pick<RawNode, 'tag' | 'label' | 'heading' | 'text'>): string {
  return tidy(raw.label) || tidy(raw.heading()) || tidy(raw.text()) || tidy(raw.tag.toLowerCase());
}

/** The protocol's own check, so one odd id never makes the studio refuse the whole tree. */
function accepted(id: string): boolean {
  return parseEditFrame({ type: 'hovered', id }, 'probe') !== undefined;
}

/**
 * One node per distinct id, in document order, at most `MAX_NODES`. The first element with an id
 * names the node; `count` is how many elements carry it. The parent is the nearest enclosing
 * element with another id that is in the tree: an element a fragment or an unmarked wrapper sits
 * around hangs under the next marked one.
 */
export function buildTree(elements: Iterable<RawNode>): TreeNode[] {
  const nodes = new Map<string, TreeNode>();
  const refused = new Set<string>();
  for (const raw of elements) {
    const known = nodes.get(raw.id);
    if (known) {
      known.count += 1;
      continue;
    }
    if (refused.has(raw.id) || nodes.size >= MAX_NODES) continue;
    if (!accepted(raw.id)) {
      refused.add(raw.id);
      continue;
    }
    const parent = raw.ancestors().find((id) => id !== raw.id && nodes.has(id)) ?? null;
    nodes.set(raw.id, { id: raw.id, parent, name: nameOf(raw), count: 1 });
  }
  return [...nodes.values()];
}

/** The computed value of every listed property, cut to what the protocol carries. */
export function readStyles(read: (name: string) => string): Record<string, string> {
  const styles: Record<string, string> = {};
  for (const name of STYLE_PROPERTIES) styles[name] = cut(read(name).trim(), MAX_STYLE_VALUE);
  return styles;
}

// The page's side: thin readers for the functions above.

function ancestorIds(element: Element): string[] {
  const ids: string[] = [];
  let parent = element.parentElement?.closest(`[${ATTRIBUTE}]`);
  while (parent) {
    ids.push(parent.getAttribute(ATTRIBUTE) ?? '');
    parent = parent.parentElement?.closest(`[${ATTRIBUTE}]`);
  }
  return ids;
}

function* rawNodes(): Generator<RawNode> {
  for (const element of document.querySelectorAll(`[${ATTRIBUTE}]`)) {
    yield {
      id: element.getAttribute(ATTRIBUTE) ?? '',
      tag: element.tagName,
      label: element.getAttribute('aria-label'),
      heading: () => element.querySelector(HEADINGS)?.textContent ?? null,
      text: () => element.textContent,
      ancestors: () => ancestorIds(element),
    };
  }
}

/** The answer to `tree`. */
export function readTree(): TreeNode[] {
  return buildTree(rawNodes());
}

/**
 * Every element whose id is in `ids`, in document order. The attribute is compared as text, so no
 * id is ever written into a selector.
 */
export function elementsWith(ids: ReadonlySet<string>): Element[] {
  if (ids.size === 0) return [];
  const found: Element[] = [];
  for (const element of document.querySelectorAll(`[${ATTRIBUTE}]`)) {
    if (ids.has(element.getAttribute(ATTRIBUTE) ?? '')) found.push(element);
  }
  return found;
}

/** The answer to `inspect`: the first element's computed styles; `found: false` without one. */
export function inspectStyles(id: string): { found: boolean; styles: Record<string, string> } {
  const element = elementsWith(new Set([id]))[0];
  if (!element) return { found: false, styles: {} };
  const style = getComputedStyle(element);
  return { found: true, styles: readStyles((name) => style.getPropertyValue(name)) };
}
