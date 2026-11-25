// What a drag shows on the page's own elements (spec 4b, decision 11; plan 14, task C2): the
// dragged elements dimmed, a dropped element moved at once with the motion of `flip.ts`, and a
// placeholder for a component the build has not rendered yet. Only the frame's DOM changes, and
// only until the build replaces the page: nothing here is written to the draft.

import type { Place } from '../../channel/structure-protocol.ts';
import { toned } from '../tones/tones.ts';
import {
  EASING,
  type Entry,
  MOTION_MS,
  type MotionKind,
  motionKind,
  planMotion,
  prefersLessMotion,
  stepTransform,
} from './flip.ts';
import type { Box } from './slots.ts';

const DIMMED = 0.4;

// The placeholder is laid out among the page's elements, so it takes the room a new element
// will take; it stays in the flow, with no place of its own.
const PLACEHOLDER_RULES = [
  'all: initial',
  'display: block',
  'box-sizing: border-box',
  'min-width: 48px',
  'min-height: 32px',
  'pointer-events: none',
];
/** Inline and important, so no rule of the prototype restyles the placeholder. */
const PLACEHOLDER_STYLE = PLACEHOLDER_RULES.map((rule) => `${rule} !important;`).join(' ');

// Colours are the studio's tones (`toned`; custom properties reach into a shadow root); the
// system colour stands in until the studio has said them.
const PLACEHOLDER_SHEET = `
.new {
  box-sizing: border-box; min-height: 32px; padding: 6px 10px;
  border: 1px dashed var(--kv-select, GrayText);
  color: var(--kv-select, GrayText);
  font: 12px/1.5 system-ui, sans-serif;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
`;

export const boxOf = (element: Element): Box => {
  const { left, top, width, height } = element.getBoundingClientRect();
  return { left, top, width, height };
};

/** The box that stands for a component the build has not rendered yet. */
export function placeholderOf(label: string): HTMLElement {
  const host = document.createElement('kitvas-placeholder');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = PLACEHOLDER_STYLE;
  toned(host);
  const sheet = document.createElement('style');
  sheet.textContent = PLACEHOLDER_SHEET;
  const box = document.createElement('div');
  box.className = 'new';
  box.textContent = label;
  host.attachShadow({ mode: 'closed' }).append(sheet, box);
  return host;
}

function put(anchor: Element, place: Place, nodes: Element[]): void {
  if (place === 'before') anchor.before(...nodes);
  else if (place === 'after') anchor.after(...nodes);
  else if (place === 'first') anchor.prepend(...nodes);
  else anchor.append(...nodes);
}

const canAnimate = (element: Element): boolean => typeof element.animate === 'function';

/** Shows the dragged elements as lifted. An animation, so no style of theirs is changed. */
export function dim(elements: Element[]): () => void {
  const frames = [{ opacity: DIMMED }, { opacity: DIMMED }];
  const held = elements
    .filter(canAnimate)
    .map((element) => element.animate(frames, { duration: 1, fill: 'forwards' }));
  return () => {
    for (const animation of held) animation.cancel();
  };
}

/** Only sliding: a moved element's new size is the layout's, not something to stretch into. */
function kindOf(element: Element): MotionKind {
  if (!(element instanceof HTMLElement)) return 'none';
  const style = getComputedStyle(element);
  const transform = style.transform;
  const kind = motionKind({
    display: style.display,
    replaced: false,
    transformable: true,
    transformed: transform !== '' && transform !== 'none',
    pinned: false,
  });
  return kind === 'full' ? 'move' : kind;
}

const inOrder = (a: Element, b: Element): number =>
  a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;

const lessMotion = (): boolean =>
  prefersLessMotion(typeof matchMedia === 'function' ? (query) => matchMedia(query) : undefined);

/**
 * Runs `change`, which moves `nodes` into `joined`, and lets them and the siblings they leave and
 * join glide from where they were to where they are now; a new node fades in.
 */
function glide(nodes: Element[], joined: Element, change: () => void): void {
  if (lessMotion()) {
    change();
    return;
  }
  const watched = new Set<Element>(nodes);
  for (const node of nodes) {
    for (const sibling of node.parentElement?.children ?? []) watched.add(sibling);
  }
  for (const child of joined.children) watched.add(child);
  // Seen before the change; a node that is not on the page yet (the placeholder) has no box.
  const first = new Map<Element, Box>();
  for (const element of watched) {
    if (element.isConnected) first.set(element, boxOf(element));
  }
  change();
  const elements = [...watched].filter((element) => element.isConnected).sort(inOrder);
  const index = new Map(elements.map((element, at) => [element, at]));
  const entries: Entry[] = elements.map((element) => {
    let up = element.parentElement;
    while (up && !index.has(up)) up = up.parentElement;
    return {
      parent: up ? (index.get(up) ?? -1) : -1,
      first: first.get(element),
      last: boxOf(element),
      kind: kindOf(element),
    };
  });
  const plan = planMotion(entries);
  if (plan.crowded) return;
  const timing = { duration: MOTION_MS, easing: EASING };
  for (const { index: at, step } of plan.moves) {
    const element = elements[at];
    if (!element || !canAnimate(element)) continue;
    const from = { transform: stepTransform(step), transformOrigin: '0 0' };
    element.animate([from, { transform: 'none', transformOrigin: '0 0' }], timing);
  }
  for (const at of plan.fades) {
    const element = elements[at];
    if (element && canAnimate(element)) element.animate([{ opacity: 0 }, { opacity: 1 }], timing);
  }
}

/** Into itself: the slots never offer it, and the DOM would refuse it with an error. */
const fits = (nodes: Element[], anchor: Element): boolean =>
  nodes.length > 0 && !nodes.some((node) => node.contains(anchor));

/** Puts `nodes` at the slot (`anchor`, `place`) at once, with motion. */
export function showDrop(nodes: Element[], anchor: Element, place: Place): void {
  if (!fits(nodes, anchor)) return;
  const joined = place === 'first' || place === 'last' ? anchor : anchor.parentElement;
  if (joined) glide(nodes, joined, () => put(anchor, place, nodes));
}

/**
 * Puts `nodes` at the slot at once with no motion: the same part of a list item's template in
 * the copies the person did not drag.
 */
export function placeDrop(nodes: Element[], anchor: Element, place: Place): void {
  if (fits(nodes, anchor)) put(anchor, place, nodes);
}
