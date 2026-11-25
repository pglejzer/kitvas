// What a Layers row is called (plan 18f, task 1): the name of what the element is, never its text.
// A kit component is named by the component, the draft's own component by its tag (`PlanCard`),
// a plain element by its first class in words (`plans__price` is `Price`), else by its tag. The
// element's text goes to the row's tooltip. Pure, so it is tested without a DOM.

import type { TreeNode } from '../../../channel/edit-protocol.ts';

/** What the structure answer says of an element: its kit component and the tag written in the TSX. */
export type NamedEntry = { component: string | null; tag: string };

/** `faq-list` is `Faq list`, `planCard` is `Plan card`: spaces for separators, sentence case. */
function sentence(raw: string): string {
  const spaced = raw
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[-_]+/g, ' ')
    .trim()
    .toLowerCase();
  return spaced === '' ? '' : spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** The words of a class: `plans__price--big` is `Price`; a block alone (`plan-card`) is `Plan card`. */
function classWords(cls: string): string {
  const element = cls.split('__').pop() ?? cls;
  return sentence(element.split('--')[0] ?? element);
}

/** A section's id in words: `faq-list` is `Faq list`, `plans` is `Plans`. */
export function sectionLabel(id: string): string {
  return sentence(id);
}

/** The tag an element id ends in (`sections/Hero:section/div` is `div`), for a row the structure lacks. */
function tagOfId(id: string): string {
  const last = id.split('/').pop() ?? id;
  const part = last.split(':').pop() ?? last;
  return /^[A-Za-z][A-Za-z0-9-]*/.exec(part)?.[0] ?? '';
}

/** The first line of a row, never empty and never the element's text. */
export function layerName(entry: NamedEntry | undefined, node: TreeNode): string {
  if (entry?.component) return entry.component;
  if (entry && /^[A-Z]/.test(entry.tag)) return entry.tag;
  const words = node.cls ? classWords(node.cls) : '';
  if (words !== '') return words;
  return entry?.tag || tagOfId(node.id) || 'element';
}
