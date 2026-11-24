// The accessibility card of one element (spec 4c, goal 7; plan 16, task C), read in the frame:
// its role, its accessible name and where the name comes from, whether a keyboard reaches it and
// where in the tab order, its text contrast, its target, an image's alt text and a heading's
// level. The rules are pure (`roleOf`, `nameOf`, `tabPosition`, `headingLevel` take plain values,
// a subset of HTML-AAM and accname that covers what drafts write); `readCard` reads the page.

import { type A11yCard, type NameSource, parseLiveFrame } from '../../channel/live-protocol.ts';
import { elementsWith } from '../edit/tree.ts';
import { cut } from '../page/snapshot.ts';
import { formatRgb, isLargeText, over, shownRatio, textContrast } from './colour.ts';
import { backgroundOf, hasOwnText, isInteractive, painted, toRgba, weightOf } from './measure.ts';

const MAX_NAME = 500;
const MAX_ROLE = 40;

/** What `roleOf` reads of an element. */
export type RoleInput = {
  /** Lower case: `button`, `input`, `h2`. */
  tag: string;
  /** The `role` attribute as written; `null` without one. */
  role: string | null;
  /** An input's `type`, lower case; `null` for anything else or none written. */
  type: string | null;
  href: boolean;
  alt: string | null;
  /** It has an accessible name (a `section` is a region only then). */
  named: boolean;
  /** It sits in an `article`, `aside`, `main`, `nav` or `section`: a header is a banner outside. */
  sectioned: boolean;
};

const INPUT_ROLES: Record<string, string> = {
  button: 'button',
  checkbox: 'checkbox',
  email: 'textbox',
  image: 'button',
  number: 'spinbutton',
  radio: 'radio',
  range: 'slider',
  reset: 'button',
  search: 'searchbox',
  submit: 'button',
  tel: 'textbox',
  text: 'textbox',
  url: 'textbox',
  password: 'textbox',
};

const TAG_ROLES: Record<string, string> = {
  article: 'article',
  aside: 'complementary',
  button: 'button',
  details: 'group',
  dialog: 'dialog',
  fieldset: 'group',
  figure: 'figure',
  form: 'form',
  hr: 'separator',
  li: 'listitem',
  main: 'main',
  menu: 'list',
  nav: 'navigation',
  ol: 'list',
  option: 'option',
  output: 'status',
  p: 'paragraph',
  progress: 'progressbar',
  select: 'combobox',
  summary: 'button',
  table: 'table',
  tbody: 'rowgroup',
  td: 'cell',
  textarea: 'textbox',
  tfoot: 'rowgroup',
  th: 'columnheader',
  thead: 'rowgroup',
  tr: 'row',
  ul: 'list',
};

const HEADING = /^h([1-6])$/;

/** The element's role: the first word of `role`, else the one its tag and attributes imply. */
export function roleOf(input: RoleInput): string {
  const written = input.role?.trim().toLowerCase().split(/\s+/)[0];
  if (written) return cut(written, MAX_ROLE);
  const { tag } = input;
  if (HEADING.test(tag)) return 'heading';
  if (tag === 'a' || tag === 'area') return input.href ? 'link' : 'generic';
  if (tag === 'img') return input.alt === '' ? 'presentation' : 'img';
  if (tag === 'input') {
    const type = input.type ?? 'text';
    return Object.hasOwn(INPUT_ROLES, type) ? (INPUT_ROLES[type] ?? 'textbox') : 'textbox';
  }
  if (tag === 'header') return input.sectioned ? 'generic' : 'banner';
  if (tag === 'footer') return input.sectioned ? 'generic' : 'contentinfo';
  if (tag === 'section') return input.named ? 'region' : 'generic';
  return Object.hasOwn(TAG_ROLES, tag) ? (TAG_ROLES[tag] ?? 'generic') : 'generic';
}

/** Roles whose name comes from their content when nothing else names them (accname 1.2). */
const FROM_CONTENT = new Set([
  'button',
  'cell',
  'checkbox',
  'columnheader',
  'heading',
  'link',
  'menuitem',
  'option',
  'radio',
  'row',
  'rowheader',
  'switch',
  'tab',
  'tooltip',
  'treeitem',
]);

/** What `nameOf` reads of an element; each `null` when the element has none. */
export type NameInput = {
  /** The text of the elements `aria-labelledby` names, joined. */
  labelledby: string | null;
  label: string | null;
  /** An image's `alt`. */
  alt: string | null;
  /** The text of a form control's `<label>` elements. */
  labels: string | null;
  text: string | null;
  title: string | null;
};

const tidy = (value: string | null): string => (value ?? '').replace(/\s+/g, ' ').trim();

/** The accessible name and where it comes from, in the order accname takes them. */
export function nameOf(input: NameInput, role: string): { name: string; from: NameSource } {
  const steps: [string | null, NameSource][] = [
    [input.labelledby, 'aria-labelledby'],
    [input.label, 'aria-label'],
    [input.alt, 'alt'],
    [input.labels, 'text'],
    [FROM_CONTENT.has(role) ? input.text : null, 'text'],
    [input.title, 'title'],
  ];
  for (const [value, from] of steps) {
    const name = tidy(value);
    if (name !== '') return { name: cut(name, MAX_NAME), from };
  }
  return { name: '', from: 'none' };
}

/**
 * The 1-based place of `target` in the sequential focus order: positive `tabindex` values first,
 * lowest first, then the rest in document order. `null` when it is not in the order.
 */
export function tabPosition<T>(
  focusable: readonly { node: T; tabIndex: number }[],
  target: T,
): number | null {
  const inOrder = focusable.filter((entry) => entry.tabIndex >= 0);
  const positive = inOrder
    .map((entry, index) => ({ ...entry, index }))
    .filter((entry) => entry.tabIndex > 0)
    .sort((a, b) => a.tabIndex - b.tabIndex || a.index - b.index);
  const order = [...positive, ...inOrder.filter((entry) => entry.tabIndex === 0)];
  const place = order.findIndex((entry) => entry.node === target);
  return place < 0 ? null : place + 1;
}

/** A heading's level: `h1` to `h6`, or `aria-level` (2 when absent) for `role="heading"`. */
export function headingLevel(tag: string, role: string, ariaLevel: string | null): number | null {
  const match = HEADING.exec(tag);
  if (role !== 'heading') return null;
  const level = Number(ariaLevel);
  if (ariaLevel !== null && Number.isInteger(level) && level >= 1 && level <= 9) return level;
  return match ? Number(match[1]) : 2;
}

// The page's side: thin readers for the functions above.

const SECTIONING = 'article, aside, main, nav, section';
const FOCUSABLE = [
  'a[href]',
  'area[href]',
  'button',
  'input',
  'select',
  'textarea',
  'summary',
  'iframe',
  '[tabindex]',
  '[contenteditable="true"]',
].join(', ');

const textOfIds = (ids: string | null): string | null => {
  if (ids === null) return null;
  const parts = ids
    .split(/\s+/)
    .filter(Boolean)
    .map((id) => document.getElementById(id)?.textContent ?? '');
  return parts.join(' ');
};

function labelsOf(element: Element): string | null {
  if (!('labels' in element)) return null;
  const labels = element.labels;
  if (!(labels instanceof NodeList)) return null;
  return [...labels].map((label) => label.textContent ?? '').join(' ');
}

/** A keyboard reaches it: in the order, enabled, painted, not inert. */
function reachable(element: Element): boolean {
  if (!(element instanceof HTMLElement || element instanceof SVGElement)) return false;
  if (element.tabIndex < 0 || element.matches(':disabled') || element.closest('[inert]')) {
    return false;
  }
  return painted(element, getComputedStyle(element));
}

function focusOrder(): { node: Element; tabIndex: number }[] {
  return [...document.querySelectorAll(FOCUSABLE)]
    .filter(reachable)
    .map((node) => ({ node, tabIndex: node instanceof HTMLElement ? node.tabIndex : 0 }));
}

/** The first element of the subtree with text of its own: whose contrast the card shows. */
function firstText(element: Element): Element | null {
  if (hasOwnText(element)) return element;
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_ELEMENT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node instanceof Element && hasOwnText(node)) return node;
  }
  return null;
}

/** The text colour and what is behind it; the contrast only for an element with text. */
function colours(element: Element): Pick<A11yCard, 'contrast' | 'color' | 'background'> {
  const own = firstText(element);
  const source = own ?? element;
  const style = getComputedStyle(source);
  const text = toRgba(style.color);
  const behind = backgroundOf(source);
  const background = behind === null ? null : formatRgb(behind);
  if (text === null) return { contrast: null, color: null, background };
  const color = formatRgb(behind === null ? text : over(text, behind));
  if (behind === null || own === null) return { contrast: null, color, background };
  const large = isLargeText(Number.parseFloat(style.fontSize) || 16, weightOf(style));
  const ratio = shownRatio(textContrast(text, behind));
  return { contrast: { ratio, large }, color, background };
}

/** The protocol's own check, so the page never refuses the answer. */
function accepted(card: A11yCard): boolean {
  const probe = { type: 'a11y-card', request: 0, id: 'probe', card };
  return parseLiveFrame(probe, 'probe') !== undefined;
}

/** The answer to `a11y`: the card of the first element with `id`; `null` when it is not there. */
export function readCard(id: string): A11yCard | null {
  const element = elementsWith(new Set([id]))[0];
  if (!element) return null;
  const tag = element.tagName.toLowerCase();
  const alt = tag === 'img' || tag === 'area' ? element.getAttribute('alt') : null;
  const name = {
    labelledby: textOfIds(element.getAttribute('aria-labelledby')),
    label: element.getAttribute('aria-label'),
    alt,
    labels: labelsOf(element),
    text: element.textContent,
    title: element.getAttribute('title'),
  };
  const roleInput = {
    tag,
    role: element.getAttribute('role'),
    type: tag === 'input' ? (element.getAttribute('type') ?? 'text').toLowerCase() : null,
    href: element.hasAttribute('href'),
    alt,
    sectioned: (element.parentElement?.closest(SECTIONING) ?? null) !== null,
  };
  // A region needs a name of its own; text content never names one.
  const named = nameOf(name, 'generic').name !== '';
  const role = roleOf({ ...roleInput, named });
  const { name: accessible, from } = nameOf(name, role);
  const focusable = reachable(element);
  const box = element.getBoundingClientRect();
  const round = (value: number): number => Math.round(value * 10) / 10;
  const target = { width: round(box.width), height: round(box.height) };
  const card: A11yCard = {
    role,
    name: accessible,
    nameFrom: from,
    focusable,
    tabIndex: focusable ? tabPosition(focusOrder(), element) : null,
    ...colours(element),
    target: isInteractive(element) ? target : null,
    alt: alt === null ? null : cut(alt, MAX_NAME),
    heading: headingLevel(tag, role, element.getAttribute('aria-level')),
  };
  return accepted(card) ? card : null;
}
