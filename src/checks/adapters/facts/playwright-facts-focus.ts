// The focus walk of a visit (ADR 0044): real Tab presses from the top of the page, with
// transitions and animations off, at most FOCUS_STOP_CAP of them. It ends on a cycle (a stop seen
// before) or when focus leaves the document. Each stop records whether anything visible changed,
// the indicator's colour and the ground just outside it, and whether fixed or sticky content
// covers it. A stop shows its focus itself or through its parent or grandparent (`:focus-within`
// on a field's wrapper). When no computed style changed, the stop's box plus RING_MARGIN is
// compared as pixels, focused and then blurred.
//
// The functions passed to `page.evaluate` use nothing from this module: they share state through
// `window.__KITVAS_FOCUS__` and the walk's `window.__KITVAS_TOOLS__`.

import { FOCUS_STOP_CAP, type FocusStop } from '../../domain/page/facts.ts';
import type { FactsWindow } from './playwright-facts-walk.ts';

type Page = import('playwright-core').Page;

/** Pixels around a stop's box that the screenshot comparison takes in. */
export const RING_MARGIN = 4;
/** Elements a person can reach with Tab; their unfocused style is kept before the walk. */
export const FOCUSABLE =
  'a[href], area[href], button, input, select, textarea, summary, iframe, audio[controls], video[controls], [tabindex], [contenteditable]';

type Signature = { outline: string; shadow: string; border: string; all: string };
type FocusStore = {
  /** The unfocused style of the focusable elements, their parents and grandparents. */
  before: Map<Element, Signature>;
  seen: Set<Element>;
  current: Element | null;
  sign(element: Element): Signature;
  style: HTMLStyleElement;
  start: HTMLElement;
};
type FocusWindow = FactsWindow & { __KITVAS_FOCUS__?: FocusStore | undefined };
type Clip = [number, number, number, number];

export type StopRead =
  | { kind: 'left' }
  | { kind: 'again' }
  | { kind: 'skip' }
  | {
      kind: 'stop';
      node: number;
      /** null: the element had no unfocused style kept. */
      changed: boolean | null;
      ring: string | null;
      ringGround: string | null;
      defaultRing: boolean;
      covered: FocusStop['covered'];
      /** Viewport pixels for the comparison; null when nothing of it is in the window. */
      clip: Clip | null;
    };

/**
 * Runs in the page: transitions and animations off, the unfocused style of every focusable
 * element (and of its parent and grandparent) kept, and focus put on a still element at the top of
 * the body, so the first Tab goes to the first stop of the page whatever had focus before.
 */
export function prepareFocus(selector: string): void {
  const scope = window as unknown as FocusWindow;
  const style = document.createElement('style');
  style.textContent =
    '*,*::before,*::after{transition:none!important;animation:none!important;scroll-behavior:auto!important}';
  document.head.append(style);
  const start = document.createElement('span');
  start.tabIndex = -1;
  start.style.cssText =
    'position:absolute;top:0;left:0;width:1px;height:1px;overflow:hidden;outline:none';
  const sign = (element: Element): Signature => {
    const css = getComputedStyle(element);
    const outline = [css.outlineStyle, css.outlineWidth, css.outlineColor, css.outlineOffset];
    const border = [css.borderStyle, css.borderWidth, css.borderColor];
    const rest = [
      css.backgroundColor,
      css.backgroundImage,
      css.color,
      css.textDecorationLine,
      css.transform,
    ];
    return {
      outline: outline.join(' '),
      shadow: css.boxShadow,
      border: border.join(' '),
      all: [...outline, css.boxShadow, ...border, ...rest].join('|'),
    };
  };
  const before = new Map<Element, Signature>();
  scope.__KITVAS_FOCUS__ = { before, seen: new Set(), current: null, sign, style, start };
  for (const element of Array.from(document.querySelectorAll(selector))) {
    const parent = element.parentElement;
    for (const holder of [element, parent, parent?.parentElement]) {
      if (holder === null || holder === undefined || before.has(holder)) continue;
      if (holder === document.body || holder === document.documentElement) continue;
      before.set(holder, sign(holder));
    }
  }
  document.body.prepend(start);
  window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  start.focus({ preventScroll: true });
}

/** Runs in the page, after a Tab press: what the element with focus shows. */
export function readStop(margin: number): StopRead {
  const scope = window as unknown as FocusWindow;
  const store = scope.__KITVAS_FOCUS__;
  const tools = scope.__KITVAS_TOOLS__;
  if (store === undefined || tools === undefined)
    throw new Error('the focus walk was not prepared');
  const active = document.activeElement;
  if (
    active === null ||
    active === document.body ||
    active === document.documentElement ||
    active === store.start
  ) {
    return { kind: 'left' };
  }
  if (store.seen.has(active)) return { kind: 'again' };
  store.seen.add(active);
  store.current = active;
  const node = tools.index(active);
  if (node === -1) return { kind: 'skip' };

  const px = (value: string): number => {
    const number = Number.parseFloat(value);
    return Number.isFinite(number) ? number : 0;
  };
  const opaque = (colour: string): boolean => colour !== '' && colour.slice(7) !== '00';
  /** The colour of the outermost outer shadow: the part of a ring that meets the ground. */
  const shadowColour = (value: string): string | null => {
    const shadows: string[] = [];
    let depth = 0;
    let from = 0;
    for (let at = 0; at < value.length; at += 1) {
      const char = value[at];
      if (char === '(') depth += 1;
      else if (char === ')') depth -= 1;
      else if (char === ',' && depth === 0) {
        shadows.push(value.slice(from, at));
        from = at + 1;
      }
    }
    shadows.push(value.slice(from));
    let best: string | null = null;
    let reach = Number.NEGATIVE_INFINITY;
    for (const shadow of shadows) {
      if (/\binset\b/i.test(shadow)) continue;
      const colour = /[a-z-]+\([^)]*\)|#[0-9a-f]{3,8}\b/i.exec(shadow)?.[0];
      if (colour === undefined) continue;
      const lengths = (shadow.replace(colour, ' ').match(/-?\d*\.?\d+px/g) ?? []).map(px);
      const [, , blur = 0, spread = 0] = lengths;
      const painted = tools.paint(colour);
      if (!opaque(painted) || Math.max(0, blur) + spread <= reach) continue;
      reach = Math.max(0, blur) + spread;
      best = painted;
    }
    return best;
  };
  const widestBorder = (css: CSSStyleDeclaration): string | null => {
    let colour: string | null = null;
    let widest = 0;
    for (const side of ['top', 'right', 'bottom', 'left']) {
      const size = px(css.getPropertyValue(`border-${side}-width`));
      const kind = css.getPropertyValue(`border-${side}-style`);
      const painted = tools.paint(css.getPropertyValue(`border-${side}-color`));
      if (kind === 'none' || kind === 'hidden' || size <= widest || !opaque(painted)) continue;
      widest = size;
      colour = painted;
    }
    return colour;
  };
  const outlined = (css: CSSStyleDeclaration): boolean =>
    css.outlineStyle !== 'none' && px(css.outlineWidth) > 0;
  /** The indicator's colour against the unfocused style: outline, else shadow, else border. */
  const ringOf = (element: Element, was: Signature | undefined, now: Signature): string | null => {
    const css = getComputedStyle(element);
    if (outlined(css) && (was === undefined || was.outline !== now.outline)) {
      const painted = tools.paint(css.outlineColor);
      return opaque(painted) ? painted : null;
    }
    if (css.boxShadow !== 'none' && (was === undefined || was.shadow !== now.shadow)) {
      return shadowColour(css.boxShadow);
    }
    return was !== undefined && was.border !== now.border ? widestBorder(css) : null;
  };

  // What shows the focus: the stop, else its parent or grandparent when their style changed.
  const was = store.before.get(active);
  const now = store.sign(active);
  let changed: boolean | null = was === undefined ? null : was.all !== now.all;
  let shows: Element = active;
  let ring = ringOf(active, was, now);
  if (changed !== true) {
    const parent = active.parentElement;
    for (const holder of [parent, parent?.parentElement]) {
      if (holder === null || holder === undefined || holder === document.body) continue;
      const unfocused = store.before.get(holder);
      const focused = store.sign(holder);
      if (unfocused === undefined || unfocused.all === focused.all) continue;
      changed = true;
      shows = holder;
      ring = ringOf(holder, unfocused, focused);
      break;
    }
  }
  const showsCss = getComputedStyle(shows);

  // A visually hidden control (a custom checkbox) shows its focus on what holds it.
  let region: Element = active;
  while (
    tools.hidden(region) &&
    region.parentElement !== null &&
    region.parentElement !== document.body
  ) {
    region = region.parentElement;
  }
  const rect = region.getBoundingClientRect();
  const inWindow = (x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < window.innerWidth && y < window.innerHeight;

  // Covered: the topmost element at a point is fixed or sticky (or inside such), and is not the
  // stop, a child of it, or a bar that holds the stop.
  const coveredAt = (x: number, y: number): boolean => {
    if (!inWindow(x, y)) return false;
    const top = document.elementsFromPoint(x, y)[0];
    if (top === undefined || region.contains(top) || active.contains(top)) return false;
    for (let up: Element | null = top; up !== null; up = up.parentElement) {
      const position = getComputedStyle(up).position;
      if ((position === 'fixed' || position === 'sticky') && !up.contains(active)) return true;
    }
    return false;
  };
  const insetX = Math.min(2, rect.width / 2);
  const insetY = Math.min(2, rect.height / 2);
  const points: [number, number][] = [
    [rect.left + rect.width / 2, rect.top + rect.height / 2],
    [rect.left + insetX, rect.top + insetY],
    [rect.right - insetX, rect.top + insetY],
    [rect.left + insetX, rect.bottom - insetY],
    [rect.right - insetX, rect.bottom - insetY],
  ];
  const hits = points.filter(([x, y]) => coveredAt(x, y)).length;

  // The ground just outside what shows the focus, past its outline, as the walk paints grounds.
  const around = shows === active ? rect : shows.getBoundingClientRect();
  const reach =
    2 +
    (outlined(showsCss) ? Math.max(0, px(showsCss.outlineOffset)) + px(showsCss.outlineWidth) : 0);
  const middleX = around.left + around.width / 2;
  const middleY = around.top + around.height / 2;
  const spots: [number, number][] = [
    [middleX, around.top - reach],
    [middleX, around.bottom + reach],
    [around.left - reach, middleY],
    [around.right + reach, middleY],
  ];
  const inside = shows === active ? region : shows;
  let ringGround: string | null = null;
  for (const [x, y] of spots) {
    if (!inWindow(x, y)) continue;
    const behind = document.elementsFromPoint(x, y).find((element) => !inside.contains(element));
    if (behind !== undefined) {
      ringGround = tools.ground(behind);
      break;
    }
  }
  if (ringGround === null && inside.parentElement !== null) {
    ringGround = tools.ground(inside.parentElement);
  }

  const left = Math.max(0, Math.floor(rect.left - margin));
  const top = Math.max(0, Math.floor(rect.top - margin));
  const right = Math.min(window.innerWidth, Math.ceil(rect.right + margin));
  const bottom = Math.min(window.innerHeight, Math.ceil(rect.bottom + margin));
  return {
    kind: 'stop',
    node,
    changed,
    ring,
    ringGround,
    defaultRing: showsCss.outlineStyle === 'auto',
    covered: hits === points.length ? 'fully' : hits > 0 ? 'partly' : 'none',
    clip: right - left >= 1 && bottom - top >= 1 ? [left, top, right - left, bottom - top] : null,
  };
}

/** Runs in the page: focus off the current stop, for its unfocused pixels. */
export function blurStop(): void {
  const active = document.activeElement;
  if (active instanceof HTMLElement || active instanceof SVGElement) active.blur();
}

/** Runs in the page: focus back on the stop, so the next Tab goes on from it. */
export function refocusStop(): void {
  const current = (window as unknown as FocusWindow).__KITVAS_FOCUS__?.current;
  if (current instanceof HTMLElement || current instanceof SVGElement) {
    current.focus({ preventScroll: true });
  }
}

/** Runs in the page: the walk's style and start element gone, nothing focused, back at the top. */
export function endFocus(): void {
  const scope = window as unknown as FocusWindow;
  const active = document.activeElement;
  if (active instanceof HTMLElement || active instanceof SVGElement) active.blur();
  scope.__KITVAS_FOCUS__?.style.remove();
  scope.__KITVAS_FOCUS__?.start.remove();
  scope.__KITVAS_FOCUS__ = undefined;
  window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
}

/** The stop's box looks different focused than blurred. Focus is back on the stop afterwards. */
async function pixelsChanged(page: Page, [x, y, width, height]: Clip): Promise<boolean> {
  const clip = { x, y, width, height };
  const focused = await page.screenshot({ clip, animations: 'disabled' });
  await page.evaluate(blurStop);
  try {
    const blurred = await page.screenshot({ clip, animations: 'disabled' });
    return !focused.equals(blurred);
  } finally {
    await page.evaluate(refocusStop);
  }
}

/** The Tab order of the page; the page is left with nothing focused, scrolled to the top. */
export async function focusWalk(page: Page): Promise<FocusStop[]> {
  const stops: FocusStop[] = [];
  try {
    await page.evaluate(prepareFocus, FOCUSABLE);
    for (let press = 0; press < FOCUS_STOP_CAP; press += 1) {
      await page.keyboard.press('Tab');
      const read = await page.evaluate(readStop, RING_MARGIN);
      if (read.kind === 'left' || read.kind === 'again') break;
      if (read.kind === 'skip') continue;
      const changed =
        read.changed === true || (read.clip !== null && (await pixelsChanged(page, read.clip)));
      stops.push({
        node: read.node,
        changed,
        ring: read.ring,
        ringGround: read.ringGround,
        defaultRing: read.defaultRing,
        covered: read.covered,
      });
    }
  } finally {
    await page.evaluate(endFocus).catch(() => undefined);
  }
  return stops;
}
