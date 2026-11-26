// The names a layer gets in Figma (plan 21, goal A3). They leave the machine, so they are the only
// names allowed: a kit component's name, the first words of a text, or an HTML tag. Never a path,
// an element id or a file name.

import type { LayerNode } from '../../../checks/index.ts';

/** A text layer is named by its first characters. */
export const TEXT_NAME_MAX = 30;

const COMPONENT_TAG = /^[A-Z][A-Za-z0-9_$]*(?:\.[A-Za-z0-9_$]+)*$/;
const HTML_TAG = /^[A-Za-z][A-Za-z0-9-]*$/;

/**
 * The kit component a layer is the root of. `tag` is the tag `ids.json` gives the layer's own
 * element id; a layer without an id of its own (what a component draws inside itself) is no root.
 */
export function componentOf(node: LayerNode, tag: string | null): string | null {
  if (!node.ownKs || tag === null) return null;
  return COMPONENT_TAG.test(tag) ? tag : null;
}

/** The layer's name: its component, else its first words when it is text, else its HTML tag. */
export function layerName(node: LayerNode, tag: string | null): string {
  const component = componentOf(node, tag);
  if (component !== null) return component;
  const html = HTML_TAG.test(node.tag) ? node.tag.toLowerCase() : 'layer';
  if (node.text === null) return html;
  const words = node.text.characters.replace(/\s+/g, ' ').trim();
  return words === '' ? html : Array.from(words).slice(0, TEXT_NAME_MAX).join('');
}
