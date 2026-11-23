// `kitvas check --deep`: the stress passes of one visit (ADR 0044, spec section 7). They run after
// the focus walk and before the spacing override, and report indexes into the element list the facts
// walk left in the page (`window.__KITVAS_NODES__`). Each part puts back what it changed (the text of
// the page, the media emulation, the viewport) and fails on its own: its result stays empty or null.
//
// Functions passed to `page.evaluate` run in the page: they use no name from outside themselves.

import { type DeepFacts, LANDSCAPE_VIEWPORT, LONG_NUMBER } from '../domain/facts.ts';
import { A11Y_CONTRAST_ON_IMAGE, UI_LONG_TEXT } from '../domain/guidelines/deep.ts';
import type { Pixels } from '../domain/look-score.ts';
import { VIEWPORTS } from '../domain/page.ts';
import { contrast } from '../domain/rules/colour.ts';
import { decodeIn } from './playwright-images.ts';

type Page = import('playwright-core').Page;

export type DeepPassInput = {
  width: number;
  height: number;
  /** Node indexes of axe's undecided `color-contrast` results, to sample from pixels. */
  unsure: number[];
};

type Stressed = DeepFacts['longText'];
type Motion = NonNullable<DeepFacts['motion']>;
type Sample = DeepFacts['contrast'][number];
type Upright = { chars: number; rotated: boolean };
type Ink = { box: [number, number, number, number]; size: number; weight: number };

type StressOptions = {
  /** `text`: short texts repeated `factor` times; `number`: number-only texts made `longNumber`. */
  mode: 'text' | 'number';
  shortChars: number;
  factor: number;
  longNumber: string;
  tolerance: number;
};

/** Motion and orientation are measured on the phone visit only. */
const PHONE_WIDTH = VIEWPORTS[0].width;
/** px a scroll size may pass its client size, or a box the screen's right edge, before it counts. */
const TOLERANCE = 1;
/** Radians a transform of html or body may turn before it counts as rotated. */
const TURN_MIN = 0.01;
/** Unsure nodes sampled at most per visit: each costs two shots. */
const CONTRAST_NODES_MAX = 40;
/** A pixel is text when its change between the two shots is at least this share of the largest… */
const INK_SHARE = 0.5;
/** …and at least this much, summed over red, green and blue, so no rounding noise counts as text. */
const INK_DIFF_MIN = 6;
/** Fewer text pixels than this give no ratio. */
const INK_PIXELS_MIN = 4;
/** The attribute that marks the node whose text is made transparent for its second shot. */
const INK_MARK = 'data-kitvas-ink';

const none = (): Stressed => ({ clipped: [], over: [] });

/** Runs in the page: two frames, so the page has reacted to a change. */
function settle(): Promise<null> {
  return new Promise((done) =>
    requestAnimationFrame(() => requestAnimationFrame(() => done(null))),
  );
}

/**
 * Runs in the page. Short leaf texts are made longer (or number-only texts replaced), every text at
 * once, and the page is measured against itself as it was: nodes newly clipped by their own
 * overflow, and nodes newly past the right edge of the screen. Every text is put back.
 */
function stressTexts(options: StressOptions): Stressed {
  const { mode, shortChars, factor, longNumber, tolerance } = options;
  const listed = (window as unknown as { __KITVAS_NODES__?: unknown }).__KITVAS_NODES__;
  const nodes: unknown[] = Array.isArray(listed) ? listed : [];
  // Digits, separators, plus, minus (the hyphen and the minus sign), percent and currency signs.
  const numberOnly = /^[\s\d.,'+%$−¢£¥€₹₩₽-]+$/;
  const clips = (value: string): boolean => value === 'hidden' || value === 'clip';
  /** A box around it scrolls or clips sideways, so it cannot push the page wider. */
  const held = (element: Element): boolean => {
    for (let box = element.parentElement; box !== null; box = box.parentElement) {
      if (box === document.body || box === document.documentElement) return false;
      if (getComputedStyle(box).overflowX !== 'visible') return true;
    }
    return false;
  };
  const measure = (): { clipped: Set<number>; over: Set<number> } => {
    const edge = document.documentElement.clientWidth + tolerance;
    const clipped = new Set<number>();
    const over = new Set<number>();
    nodes.forEach((node, index) => {
      if (!(node instanceof Element) || !node.isConnected) return;
      const style = getComputedStyle(node);
      // An ellipsis or a line clamp is a decision about long text, not an accident.
      const clamp = style.getPropertyValue('-webkit-line-clamp');
      const chosen = style.textOverflow === 'ellipsis' || (clamp !== '' && clamp !== 'none');
      const cut =
        (clips(style.overflowX) && node.scrollWidth > node.clientWidth + tolerance) ||
        (clips(style.overflowY) && node.scrollHeight > node.clientHeight + tolerance);
      if (cut && !chosen) clipped.add(index);
      const rect = node.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      // Text running out of a block that lets it show makes the block's scroll size, not its box.
      const right =
        style.overflowX === 'visible'
          ? Math.max(rect.right, rect.left + node.scrollWidth)
          : rect.right;
      if (right + window.scrollX > edge && !held(node)) over.add(index);
    });
    return { clipped, over };
  };
  /** The longer text for a leaf, or null when this mode leaves it alone. */
  const grown = (core: string): string | null => {
    const numeric = numberOnly.test(core) && /\d/.test(core);
    if (mode === 'number') return numeric && core.length < longNumber.length ? longNumber : null;
    // A word of three letters at least: icons, initials and numbers do not grow with language.
    if (numeric || core.length >= shortChars || !/\p{L}{3}/u.test(core)) return null;
    return Array.from({ length: factor }, () => core).join(' ');
  };

  const changed: { text: Text; data: string }[] = [];
  try {
    const before = measure();
    for (const node of nodes) {
      if (!(node instanceof Element) || node.childElementCount > 0) continue;
      if (node.closest('svg, script, style, noscript, textarea, select, option') !== null) continue;
      const parts = Array.from(node.childNodes).filter(
        (child): child is Text => child instanceof Text,
      );
      const whole = parts.map((part) => part.data).join('');
      const core = whole.replace(/\s+/g, ' ').trim();
      if (core === '') continue;
      const next = grown(core);
      if (next === null) continue;
      const lead = /^\s*/.exec(whole)?.[0] ?? '';
      const trail = /\s*$/.exec(whole)?.[0] ?? '';
      parts.forEach((part, at) => {
        changed.push({ text: part, data: part.data });
        part.data = at === 0 ? `${lead}${next}${trail}` : '';
      });
    }
    if (changed.length === 0) return { clipped: [], over: [] };
    const after = measure();
    const fresh = (now: Set<number>, then: Set<number>): number[] =>
      [...now].filter((index) => !then.has(index)).sort((a, b) => a - b);
    const over = fresh(after.over, before.over);
    const element = (index: number): Element => nodes[index] as Element;
    return {
      clipped: fresh(after.clipped, before.clipped),
      // The deepest only: a box is past the edge because something inside it is.
      over: over.filter(
        (index) =>
          !over.some((other) => other !== index && element(index).contains(element(other))),
      ),
    };
  } finally {
    for (const { text, data } of changed) text.data = data;
  }
}

/**
 * Runs in the page: animations that repeat forever and autoplay videos still playing, and whether
 * a control named pause or stop sits in the same region as every one of them.
 */
function readMotion(): Motion {
  const listed = (window as unknown as { __KITVAS_NODES__?: unknown }).__KITVAS_NODES__;
  const nodes: unknown[] = Array.isArray(listed) ? listed : [];
  const indexes = new Map<unknown, number>();
  nodes.forEach((node, index) => {
    indexes.set(node, index);
  });
  const running = new Set<number>();
  const autoplay = new Set<number>();
  const moving: Element[] = [];
  for (const animation of document.getAnimations()) {
    if (animation.playState !== 'running') continue;
    const effect = animation.effect;
    if (!(effect instanceof KeyframeEffect)) continue;
    if (effect.getComputedTiming().iterations !== Number.POSITIVE_INFINITY) continue;
    const target = effect.target;
    const index = target === null ? undefined : indexes.get(target);
    if (target === null || index === undefined) continue;
    running.add(index);
    moving.push(target);
  }
  for (const video of Array.from(document.querySelectorAll('video'))) {
    if (!video.autoplay || video.paused || video.ended) continue;
    const index = indexes.get(video);
    if (index === undefined) continue;
    autoplay.add(index);
    moving.push(video);
  }
  const controls = [
    'button',
    '[role="button"]',
    '[role="switch"]',
    'input[type="button"]',
    'input[type="checkbox"]',
    'a[href]',
  ].join(', ');
  const regions = [
    'section',
    'article',
    'aside',
    'header',
    'footer',
    'main',
    'nav',
    'figure',
    'form',
    'dialog',
    '[role="region"]',
    '[role="banner"]',
    '[role="main"]',
    '[role="contentinfo"]',
    '[role="complementary"]',
    '[role="dialog"]',
  ].join(', ');
  const nameOf = (control: Element): string => {
    const labelled = (control.getAttribute('aria-labelledby') ?? '')
      .split(/\s+/)
      .map((id) => (id === '' ? '' : (document.getElementById(id)?.textContent ?? '')));
    const value = control instanceof HTMLInputElement ? control.value : '';
    return [
      control.getAttribute('aria-label') ?? '',
      ...labelled,
      control.textContent ?? '',
      control.getAttribute('title') ?? '',
      value,
    ].join(' ');
  };
  const pausable = (element: Element): boolean => {
    const region = element.closest(regions) ?? document.body;
    return Array.from(region.querySelectorAll(controls)).some((control) =>
      /\b(pause|stop)\b/i.test(nameOf(control)),
    );
  };
  const order = (found: Set<number>): number[] => [...found].sort((a, b) => a - b);
  return {
    running: order(running),
    autoplay: order(autoplay),
    pause: moving.length > 0 && moving.every(pausable),
  };
}

/** Runs in the page: characters of rendered text (whitespace collapsed); is html or body turned? */
function readOrientation(turnMin: number): Upright {
  let chars = 0;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  for (let text = walker.nextNode(); text !== null; text = walker.nextNode()) {
    const words = (text.textContent ?? '').replace(/\s+/g, ' ').trim();
    const parent = text.parentElement;
    if (words === '' || parent === null) continue;
    if (parent.closest('script, style, noscript, template') !== null) continue;
    if (!parent.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
    range.selectNodeContents(text);
    const rect = range.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) continue;
    chars += words.length;
  }
  const turned = (element: Element): boolean => {
    const style = getComputedStyle(element);
    const rotate = style.getPropertyValue('rotate').trim();
    const angle = rotate.split(/\s+/).pop() ?? '';
    if (rotate !== '' && rotate !== 'none' && !/^0(deg|rad|grad|turn)?$/.test(angle)) return true;
    const matrix = /^matrix(?:3d)?\(([^)]*)\)$/.exec(style.transform);
    if (matrix === null) return false;
    const [a = 1, b = 0] = (matrix[1] ?? '').split(',').map(Number);
    return Math.abs(Math.atan2(b, a)) > turnMin;
  };
  return { chars, rotated: turned(document.documentElement) || turned(document.body) };
}

/** Runs in the page: a listed node's box on the page, inside the document, and its font. */
function readInk(index: number): Ink | null {
  const listed = (window as unknown as { __KITVAS_NODES__?: unknown }).__KITVAS_NODES__;
  const element = Array.isArray(listed) ? listed[index] : undefined;
  if (!(element instanceof Element) || !element.isConnected) return null;
  const rect = element.getBoundingClientRect();
  const root = document.documentElement;
  const left = Math.max(0, Math.floor(rect.left + window.scrollX));
  const top = Math.max(0, Math.floor(rect.top + window.scrollY));
  const right = Math.min(root.scrollWidth, Math.ceil(rect.right + window.scrollX));
  const bottom = Math.min(root.scrollHeight, Math.ceil(rect.bottom + window.scrollY));
  if (right - left < 1 || bottom - top < 1) return null;
  const style = getComputedStyle(element);
  return {
    box: [left, top, right - left, bottom - top],
    size: Number.parseFloat(style.fontSize) || 0,
    weight: Number.parseFloat(style.fontWeight) || 0,
  };
}

/** Runs in the page: the text of a node, its children and pseudo-elements made transparent, or back. */
function clearInk({ index, on, mark }: { index: number; on: boolean; mark: string }): void {
  const listed = (window as unknown as { __KITVAS_NODES__?: unknown }).__KITVAS_NODES__;
  const element = Array.isArray(listed) ? listed[index] : undefined;
  const sheet = `${mark}-sheet`;
  if (!on) {
    if (element instanceof Element) element.removeAttribute(mark);
    document.getElementById(sheet)?.remove();
    return;
  }
  if (!(element instanceof Element)) return;
  element.setAttribute(mark, '');
  const style = document.createElement('style');
  style.id = sheet;
  const at = `[${mark}]`;
  // Text shadows stay: they are part of what the text is read against.
  style.textContent = `${at}, ${at} *, ${at}::before, ${at}::after, ${at} *::before, ${at} *::after {
    color: transparent !important;
    -webkit-text-fill-color: transparent !important;
    text-decoration-color: transparent !important;
    caret-color: transparent !important;
    transition: none !important;
  }`;
  document.head.append(style);
}

const pair = (channel: number): string => Math.round(channel).toString(16).padStart(2, '0');

function middle(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

/**
 * The contrast of the text in a box, from a shot with the text and one without. The pixels that
 * change most are the glyphs: the text colour is their median in the first shot, the ground their
 * median in the second. Floored to two decimals, since WCAG ratios are not rounded up. Null when the
 * shots differ in size or too few pixels changed.
 */
export function inkRatio(shown: Pixels, bare: Pixels): number | null {
  if (shown.width !== bare.width || shown.height !== bare.height) return null;
  const count = shown.width * shown.height;
  const change = new Uint16Array(count);
  let most = 0;
  for (let at = 0; at < count; at += 1) {
    let sum = 0;
    for (let channel = 0; channel < 3; channel += 1) {
      const offset = at * 4 + channel;
      sum += Math.abs((shown.data[offset] ?? 0) - (bare.data[offset] ?? 0));
    }
    change[at] = sum;
    most = Math.max(most, sum);
  }
  const floor = Math.max(INK_DIFF_MIN, most * INK_SHARE);
  const ink: [number[], number[], number[]] = [[], [], []];
  const ground: [number[], number[], number[]] = [[], [], []];
  for (let at = 0; at < count; at += 1) {
    if ((change[at] ?? 0) < floor) continue;
    for (let channel = 0; channel < 3; channel += 1) {
      ink[channel]?.push(shown.data[at * 4 + channel] ?? 0);
      ground[channel]?.push(bare.data[at * 4 + channel] ?? 0);
    }
  }
  if (ink[0].length < INK_PIXELS_MIN) return null;
  const hex = (planes: number[][]): string =>
    `#${planes.map((plane) => pair(middle(plane))).join('')}`;
  return Math.floor(contrast(hex(ink), hex(ground)) * 100) / 100;
}

/** One unsure node: a shot as it is, a shot with its text transparent, and the ratio between them. */
async function sampleInk(page: Page, index: number): Promise<Sample | null> {
  const ink = await page.evaluate(readInk, index);
  if (ink === null) return null;
  const [x, y, width, height] = ink.box;
  // Animations are stopped for each shot, so both show the same frame.
  const shoot = (): Promise<Uint8Array> =>
    page.screenshot({ clip: { x, y, width, height }, fullPage: true, animations: 'disabled' });
  const shown = await shoot();
  const bare = await page
    .evaluate(clearInk, { index, on: true, mark: INK_MARK })
    .then(shoot)
    .finally(() => page.evaluate(clearInk, { index, on: false, mark: INK_MARK }));
  const errors: string[] = [];
  const shownPixels = await decodeIn(page, shown, 'the shot', errors);
  const barePixels = await decodeIn(page, bare, 'the shot without text', errors);
  if (shownPixels === undefined || barePixels === undefined) return null;
  const ratio = inkRatio(shownPixels, barePixels);
  if (ratio === null) return null;
  const { largeSize, largeBoldSize, boldWeight } = A11Y_CONTRAST_ON_IMAGE.thresholds;
  const large = ink.size >= largeSize || (ink.size >= largeBoldSize && ink.weight >= boldWeight);
  return { node: index, ratio, large };
}

async function contrastPass(page: Page, unsure: number[]): Promise<Sample[]> {
  const samples: Sample[] = [];
  for (const index of [...new Set(unsure)].slice(0, CONTRAST_NODES_MAX)) {
    const sample = await attempt(() => sampleInk(page, index), null);
    if (sample !== null) samples.push(sample);
  }
  return samples;
}

function stress(page: Page, mode: StressOptions['mode']): Promise<Stressed> {
  return page.evaluate(stressTexts, {
    mode,
    shortChars: UI_LONG_TEXT.thresholds.shortChars,
    factor: UI_LONG_TEXT.thresholds.factor,
    longNumber: LONG_NUMBER,
    tolerance: TOLERANCE,
  });
}

/** With reduced motion emulated; the context's own setting, no preference, is put back. */
async function motionPass(page: Page): Promise<DeepFacts['motion']> {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  try {
    await page.evaluate(settle);
    return await page.evaluate(readMotion);
  } finally {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.evaluate(settle);
  }
}

/** The text upright, then at LANDSCAPE_VIEWPORT, and the visit's own size put back. */
async function orientationPass(
  page: Page,
  input: DeepPassInput,
): Promise<DeepFacts['orientation']> {
  const upright = await page.evaluate(readOrientation, TURN_MIN);
  const sideways = await page
    .setViewportSize({ ...LANDSCAPE_VIEWPORT })
    .then(() => page.evaluate(settle))
    .then(() => page.evaluate(readOrientation, TURN_MIN))
    .finally(async () => {
      await page.setViewportSize({ width: input.width, height: input.height });
      await page.evaluate(settle);
    });
  return {
    landscape: sideways.chars,
    portrait: upright.chars,
    rotated: upright.rotated || sideways.rotated,
  };
}

/** The result of `work`, or `fallback` when it throws: one part failing never stops the others. */
async function attempt<T>(work: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await work();
  } catch {
    return fallback;
  }
}

/**
 * Every deep part on the page as it is after the focus walk. Contrast goes first, on the untouched
 * page; the viewport changes last, because a page may re-render when it is resized.
 */
export async function deepPasses(page: Page, input: DeepPassInput): Promise<DeepFacts> {
  const phone = input.width === PHONE_WIDTH;
  const contrastFound = await attempt(() => contrastPass(page, input.unsure), []);
  const longText = await attempt(() => stress(page, 'text'), none());
  const longNumber = await attempt(() => stress(page, 'number'), none());
  const motion = phone ? await attempt(() => motionPass(page), null) : null;
  const orientation = phone ? await attempt(() => orientationPass(page, input), null) : null;
  return { longText, longNumber, motion, orientation, contrast: contrastFound };
}
