// The live measurements in a frame (spec 4c, goals 5 and 8; plan 16, task C): the elements the
// page names and everything inside them, once the page has settled. The judgments are pure
// (`contrastFact`, `targetFact`, `boxFacts`, `mismatchFact`, `keepWorst` take plain values); the
// rest reads the page and hands them over. The build check sets the edited value inline for one
// synchronous read and puts the element's own style back before anything can paint.

import {
  CANVAS,
  formatRgb,
  isLargeText,
  neededRatio,
  over,
  parseColour,
  type Rgba,
  shownRatio,
  targetOk,
  textContrast,
} from '../../../src/shared/values/colour.ts';
import {
  type Expected,
  type LiveFact,
  MAX_FACTS,
  parseLiveFrame,
} from '../../channel/live-protocol.ts';
import { elementsWith } from '../edit/tree.ts';
import { cut } from '../page/snapshot.ts';

/** At most this many elements are measured for one answer: a long list stays cheap. */
const MAX_WALK = 3000;
const MAX_VALUE = 200;
const MARKED = '[data-ks]';
/** Elements a person can press or type into (WCAG 2.5.8 counts their targets). */
const INTERACTIVE = [
  'a[href]',
  'button',
  'input:not([type="hidden"])',
  'select',
  'textarea',
  'summary',
  '[role="button"]',
  '[role="link"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="switch"]',
  '[role="tab"]',
  '[role="menuitem"]',
  '[role="option"]',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');
const CLIPS = new Set(['hidden', 'clip']);

/** One text as the contrast rule needs it. */
export type TextSample = { color: Rgba; background: Rgba; px: number; weight: number };

/** The contrast fact of one text; `null` when it meets AA. */
export function contrastFact(id: string, sample: TextSample): LiveFact | null {
  const large = isLargeText(sample.px, sample.weight);
  const ratio = textContrast(sample.color, sample.background);
  const needed = neededRatio(large);
  if (ratio >= needed) return null;
  const background = over(sample.background, CANVAS);
  return {
    id,
    rule: 'contrast',
    severity: 'fix',
    values: {
      ratio: shownRatio(ratio),
      needed,
      color: formatRgb(over(sample.color, background)),
      background: formatRgb(background),
    },
  };
}

/** The target fact of one interactive element; `null` when it is big enough. */
export function targetFact(id: string, box: { width: number; height: number }): LiveFact | null {
  if (targetOk(box.width, box.height)) return null;
  const width = Math.round(box.width * 10) / 10;
  const height = Math.round(box.height * 10) / 10;
  return { id, rule: 'target-size', severity: 'review', values: { width, height } };
}

/** What `boxFacts` reads of one element's box. */
export type BoxSample = {
  clientWidth: number;
  clientHeight: number;
  scrollWidth: number;
  scrollHeight: number;
  overflowX: string;
  overflowY: string;
  /** It holds text. */
  text: boolean;
  /** It cuts its text on purpose: `text-overflow: ellipsis` or a line clamp. */
  truncates: boolean;
};

/**
 * Content wider than its box (it spills out where it can be seen), and text cut by an overflow
 * that hides. A box of a pixel or less is a visually hidden label, never a finding.
 */
export function boxFacts(id: string, box: BoxSample): LiveFact[] {
  if (box.clientWidth <= 1 || box.clientHeight <= 1) return [];
  const wide = box.scrollWidth > box.clientWidth + 1;
  const tall = box.scrollHeight > box.clientHeight + 1;
  const facts: LiveFact[] = [];
  if (wide && box.overflowX === 'visible') {
    facts.push({
      id,
      rule: 'overflow',
      severity: 'review',
      values: { width: box.clientWidth, content: box.scrollWidth },
    });
  }
  const cutX = wide && CLIPS.has(box.overflowX);
  const cutY = tall && CLIPS.has(box.overflowY);
  if (box.text && !box.truncates && (cutX || cutY)) {
    facts.push({
      id,
      rule: 'clipped',
      severity: 'review',
      values: { width: box.clientWidth, height: box.clientHeight },
    });
  }
  return facts;
}

const tidy = (value: string): string => value.replace(/\s+/g, ' ').trim();

/** The build against what the editor showed; `null` when the two computed values agree. */
export function mismatchFact(
  id: string,
  property: string,
  expected: string,
  actual: string,
): LiveFact | null {
  if (tidy(expected) === tidy(actual)) return null;
  return {
    id,
    rule: 'mismatch',
    severity: 'review',
    values: {
      property,
      expected: cut(tidy(expected), MAX_VALUE),
      actual: cut(tidy(actual), MAX_VALUE),
    },
  };
}

const factKey = (fact: LiveFact): string =>
  fact.rule === 'mismatch'
    ? `${fact.id}|mismatch|${fact.values.property}`
    : `${fact.id}|${fact.rule}`;

const worse = (next: LiveFact, kept: LiveFact): boolean => {
  if (next.rule !== 'contrast') return false;
  return Number(next.values.ratio) < Number(kept.values.ratio);
};

/** One fact per element and rule (per property for the build check), the worst one, in order. */
export function keepWorst(facts: readonly LiveFact[]): LiveFact[] {
  const kept = new Map<string, LiveFact>();
  for (const fact of facts) {
    const key = factKey(fact);
    const seen = kept.get(key);
    if (!seen || worse(fact, seen)) kept.set(key, fact);
  }
  return [...kept.values()].slice(0, MAX_FACTS);
}

/** The protocol's own check: one odd fact never makes the page refuse the whole answer. */
function accepted(fact: LiveFact): boolean {
  const probe = { type: 'live-facts', request: 0, width: 0, facts: [fact] };
  return parseLiveFrame(probe, 'probe') !== undefined;
}

// The page's side: thin readers for the functions above.

let paint: CanvasRenderingContext2D | null | undefined;

/** Any CSS colour as sRGB: the computed text when it can be read, else painted on a canvas. */
export function toRgba(text: string): Rgba | null {
  const parsed = parseColour(text);
  if (parsed) return parsed;
  if (paint === undefined) {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    paint = canvas.getContext('2d', { willReadFrequently: true });
  }
  if (!paint) return null;
  paint.clearRect(0, 0, 1, 1);
  paint.fillStyle = 'rgba(0, 0, 0, 0)';
  paint.fillStyle = text;
  paint.fillRect(0, 0, 1, 1);
  const [r = 0, g = 0, b = 0, a = 0] = paint.getImageData(0, 0, 1, 1).data;
  return { r, g, b, a: a / 255 };
}

/**
 * The colour behind an element: its own and its ancestors' backgrounds, nearest last, over the
 * canvas. `null` over an image or a gradient: the full check judges text on those.
 */
export function backgroundOf(element: Element): Rgba | null {
  const layers: Rgba[] = [];
  for (let node: Element | null = element; node; node = node.parentElement) {
    const style = getComputedStyle(node);
    if (style.backgroundImage !== 'none') return null;
    const colour = toRgba(style.backgroundColor);
    if (colour === null) return null;
    if (colour.a > 0) layers.push(colour);
    if (colour.a >= 1) break;
  }
  let behind = CANVAS;
  for (const layer of layers.reverse()) behind = over(layer, behind);
  return behind;
}

export const hasOwnText = (element: Element): boolean =>
  [...element.childNodes].some((node) => node instanceof Text && node.data.trim() !== '');

export const weightOf = (style: CSSStyleDeclaration): number => {
  const weight = Number(style.fontWeight);
  if (Number.isFinite(weight)) return weight;
  return style.fontWeight === 'bold' ? 700 : 400;
};

/** It is painted: a box, shown, not fully transparent. */
export function painted(element: Element, style: CSSStyleDeclaration): boolean {
  if (style.display === 'none' || style.visibility !== 'visible' || style.opacity === '0') {
    return false;
  }
  const box = element.getBoundingClientRect();
  return box.width > 0 && box.height > 0;
}

/** A text the person cannot act on: WCAG leaves disabled controls out of contrast. */
const inactive = (element: Element): boolean =>
  element.closest(':disabled, [aria-disabled="true"]') !== null;

/** The text sample of an element with text of its own; `null` without one or over an image. */
export function textSample(element: Element, style: CSSStyleDeclaration): TextSample | null {
  if (!hasOwnText(element) || inactive(element)) return null;
  const color = toRgba(style.color);
  const background = backgroundOf(element);
  if (color === null || background === null) return null;
  const px = Number.parseFloat(style.fontSize) || 16;
  return { color, background, px, weight: weightOf(style) };
}

export const isInteractive = (element: Element): boolean => element.matches(INTERACTIVE);

/** A link inside a sentence: WCAG 2.5.8 leaves its target size to the line it sits in. */
function inSentence(element: Element, style: CSSStyleDeclaration): boolean {
  if (style.display !== 'inline') return false;
  const own = (element.textContent ?? '').trim().length;
  const around = (element.parentElement?.textContent ?? '').trim().length;
  return around > own;
}

const idOf = (element: Element): string | null =>
  element.closest(MARKED)?.getAttribute('data-ks') ?? null;

/** The elements named and everything inside them, in document order, each once. */
function measured(ids: ReadonlySet<string>): Element[] {
  const found: Element[] = [];
  const seen = new Set<Element>();
  for (const root of elementsWith(ids)) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
    for (let node: Node | null = root; node; node = walker.nextNode()) {
      if (found.length >= MAX_WALK) return found;
      if (!(node instanceof Element) || seen.has(node)) continue;
      seen.add(node);
      found.push(node);
    }
  }
  return found;
}

function boxSample(element: Element, style: CSSStyleDeclaration): BoxSample {
  const clamp = style.getPropertyValue('-webkit-line-clamp').trim();
  return {
    clientWidth: element.clientWidth,
    clientHeight: element.clientHeight,
    scrollWidth: element.scrollWidth,
    scrollHeight: element.scrollHeight,
    overflowX: style.overflowX,
    overflowY: style.overflowY,
    text: (element.textContent ?? '').trim() !== '',
    truncates: style.textOverflow === 'ellipsis' || (clamp !== '' && clamp !== 'none'),
  };
}

/** The facts of one element of the walk. */
function factsOf(element: Element): LiveFact[] {
  const id = idOf(element);
  if (id === null) return [];
  const style = getComputedStyle(element);
  if (!painted(element, style)) return [];
  const facts: LiveFact[] = [];
  const sample = textSample(element, style);
  const contrast = sample ? contrastFact(id, sample) : null;
  if (contrast) facts.push(contrast);
  if (isInteractive(element) && !inactive(element) && !inSentence(element, style)) {
    const box = element.getBoundingClientRect();
    const target = targetFact(id, box);
    if (target) facts.push(target);
  }
  if (style.display !== 'inline' && style.display !== 'contents') {
    facts.push(...boxFacts(id, boxSample(element, style)));
  }
  return facts;
}

/**
 * What the edited value computes to on this very element: it is set inline and important for one
 * read, with transitions off. The value goes first and is read once more while transitions are
 * still off, so the way back never animates; then the element's own style attribute comes back
 * exactly. `null` when the browser drops the value as invalid.
 */
export function intended(element: Element, property: string, value: string): string | null {
  if (!(element instanceof HTMLElement || element instanceof SVGElement)) return null;
  const own = element.getAttribute('style');
  const style = element.style;
  style.setProperty('transition', 'none', 'important');
  const still = element.getAttribute('style') ?? '';
  style.setProperty(property, value, 'important');
  const taken = style.getPropertyValue(property) !== '';
  const read = getComputedStyle(element).getPropertyValue(property);
  element.setAttribute('style', still);
  void getComputedStyle(element).getPropertyValue(property);
  if (own === null) element.removeAttribute('style');
  else element.setAttribute('style', own);
  return taken ? read : null;
}

function mismatchOf(expect: Expected): LiveFact | null {
  const element = elementsWith(new Set([expect.id]))[0];
  if (!element) return null;
  const actual = getComputedStyle(element).getPropertyValue(expect.property);
  const wanted = intended(element, expect.property, expect.value);
  return wanted === null ? null : mismatchFact(expect.id, expect.property, wanted, actual);
}

/** The answer to `measure-live`: the problems of the named elements and their descendants. */
export function measureLive(ids: readonly string[], expect: readonly Expected[]): LiveFact[] {
  const facts: LiveFact[] = [];
  for (const element of measured(new Set(ids))) {
    try {
      facts.push(...factsOf(element));
    } catch {
      // An element that cannot be measured has no facts.
    }
  }
  for (const one of expect) {
    try {
      const fact = mismatchOf(one);
      if (fact) facts.push(fact);
    } catch {
      // A value that cannot be compared is not a finding.
    }
  }
  return keepWorst(facts.filter(accepted));
}
