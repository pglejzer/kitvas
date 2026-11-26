// The `states` pass of a visit (ADR 0085): every control of the page under a real pointer and with
// keyboard focus, and what its text looks like there against rest. Hover is a real `page.mouse`
// move, so `:hover` rules apply as they do for a person; focus is `element.focus()` after one key
// press, so `:focus-visible` matches. A control gets a read for a state only when some text's ink
// or ground differs from rest, and the read holds only those texts. Transitions and animations are
// off, so a state is read as it settles. The page is left with the pointer parked, nothing
// focused and scrolled to the top.
//
// The functions passed to `page.evaluate` use nothing from this module: they share state through
// `window.__KITVAS_STATES__` and the walk's `window.__KITVAS_TOOLS__`.

import { STATE_CONTROL_CAP, type StateRead, type StateText } from '../../domain/page/facts.ts';
import { settle } from '../browser/settle.ts';
import type { FactsWindow } from './playwright-facts-walk.ts';

type Page = import('playwright-core').Page;

/** What a person can point at or focus. */
export const CONTROLS =
  'a[href], button, input, select, textarea, summary, [tabindex], [role="button"], [role="tab"], [role="link"], [role="menuitem"], [role="option"], [role="switch"], [role="checkbox"], [role="radio"]';
const STYLE_ID = 'kitvas-states-style';

type StatesStore = { controls: Element[]; style: HTMLStyleElement };
type StatesWindow = FactsWindow & { __KITVAS_STATES__?: StatesStore | undefined };

/** Runs in the page, with the control as its argument: its name and whether it is switched on. */
export function describeControl(element: Element): { name: string; on: boolean } {
  const clean = (text: string | null | undefined): string =>
    (text ?? '').replace(/\s+/g, ' ').trim();
  let name = clean(element.getAttribute('aria-label'));
  const labelled = element.getAttribute('aria-labelledby');
  if (name === '' && labelled !== null) {
    name = clean(
      labelled
        .split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent)
        .join(' '),
    );
  }
  if (
    name === '' &&
    (element instanceof HTMLInputElement ||
      element instanceof HTMLSelectElement ||
      element instanceof HTMLTextAreaElement)
  ) {
    name = clean(
      Array.from(element.labels ?? [])
        .map((label) => label.textContent)
        .join(' '),
    );
  }
  if (name === '' && !(element instanceof HTMLSelectElement)) name = clean(element.textContent);
  if (name === '') {
    name = clean(
      element.getAttribute('title') ??
        element.getAttribute('placeholder') ??
        element.getAttribute('value') ??
        element.getAttribute('name'),
    );
  }
  const current = element.getAttribute('aria-current');
  const on =
    ['aria-pressed', 'aria-selected', 'aria-checked'].some(
      (key) => element.getAttribute(key) === 'true',
    ) ||
    (current !== null && current !== 'false');
  return { name: name.slice(0, 40), on };
}

/**
 * Runs in the page: transitions and animations off, and the controls kept: in the walk, not hidden,
 * not disabled, with a box, in document order, at most `cap`. Gives how many.
 */
export function prepareStates({
  selector,
  cap,
  id,
}: {
  selector: string;
  cap: number;
  id: string;
}): number {
  const scope = window as unknown as StatesWindow;
  const tools = scope.__KITVAS_TOOLS__;
  if (tools === undefined) throw new Error('the states pass needs the facts walk');
  const style = document.createElement('style');
  style.id = id;
  style.textContent =
    '*,*::before,*::after{transition:none!important;animation:none!important;scroll-behavior:auto!important}';
  document.head.append(style);
  const controls = Array.from(document.querySelectorAll(selector))
    .filter((element) => {
      if (tools.index(element) === -1 || tools.hidden(element)) return false;
      if (element.matches(':disabled, [aria-disabled="true"]')) return false;
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    })
    .slice(0, cap);
  scope.__KITVAS_STATES__ = { controls, style };
  return controls.length;
}

/** Runs in the page: the control at this place in the kept list, undefined when it is gone. */
export function controlAt(at: number): Element | undefined {
  const element = (window as unknown as StatesWindow).__KITVAS_STATES__?.controls[at];
  return element?.isConnected === true ? element : undefined;
}

/** Runs in the page: scrolls the control into view and gives the point to aim at, in the window. */
export function aim({ at, middle }: { at: number; middle: boolean }): [number, number] | null {
  const element = (window as unknown as StatesWindow).__KITVAS_STATES__?.controls[at];
  if (element === undefined || !element.isConnected) return null;
  element.scrollIntoView(
    middle
      ? { block: 'center', inline: 'center', behavior: 'instant' }
      : { block: 'nearest', inline: 'nearest', behavior: 'instant' },
  );
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  const clamp = (value: number, limit: number): number => Math.min(Math.max(value, 0), limit - 1);
  return [
    clamp(rect.left + rect.width / 2, window.innerWidth),
    clamp(rect.top + rect.height / 2, window.innerHeight),
  ];
}

/** Runs in the page: the pointer is over the control. */
export function hovered(at: number): boolean {
  return (
    (window as unknown as StatesWindow).__KITVAS_STATES__?.controls[at]?.matches(':hover') === true
  );
}

/** Runs in the page: focuses the control; true when the browser shows it as `:focus-visible`. */
export function focusControl(at: number): boolean {
  const element = (window as unknown as StatesWindow).__KITVAS_STATES__?.controls[at];
  if (!(element instanceof HTMLElement || element instanceof SVGElement)) return false;
  element.focus({ preventScroll: true });
  return element.matches(':focus-visible');
}

/** Runs in the page: nothing has focus. */
export function blurAll(): void {
  const active = document.activeElement;
  if (active instanceof HTMLElement || active instanceof SVGElement) active.blur();
}

/** Runs in the page: the style gone, nothing focused, back at the top. */
export function endStates(): void {
  const scope = window as unknown as StatesWindow;
  const active = document.activeElement;
  if (active instanceof HTMLElement || active instanceof SVGElement) active.blur();
  scope.__KITVAS_STATES__?.style.remove();
  scope.__KITVAS_STATES__ = undefined;
  window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
}

/**
 * Runs in the page: every text inside the control, by its holder element (once each), skipping
 * holders that are not seen. `ink` is the colour with its alpha and the opacity of the holder and
 * its ancestors laid over `ground`.
 */
export function readTexts(at: number): StateText[] {
  const scope = window as unknown as StatesWindow;
  const store = scope.__KITVAS_STATES__;
  const tools = scope.__KITVAS_TOOLS__;
  const control = store?.controls[at];
  if (tools === undefined || control === undefined || !control.isConnected) return [];
  const channels = (hex: string): [number, number, number, number] => {
    if (hex.length !== 9) return [0, 0, 0, 0];
    const part = (from: number): number => Number.parseInt(hex.slice(from, from + 2), 16);
    return [part(1), part(3), part(5), part(7) / 255];
  };
  const pair = (value: number): string =>
    Math.round(Math.min(255, Math.max(0, value)))
      .toString(16)
      .padStart(2, '0');
  const texts: StateText[] = [];
  const seen = new Set<Element>();
  const walker = document.createTreeWalker(control, NodeFilter.SHOW_TEXT);
  for (let text = walker.nextNode(); text !== null; text = walker.nextNode()) {
    const holder = text.parentElement;
    if (holder === null || seen.has(holder) || (text.textContent ?? '').trim() === '') continue;
    seen.add(holder);
    const css = getComputedStyle(holder);
    if (css.visibility === 'hidden' || holder.getClientRects().length === 0) continue;
    let opacity = 1;
    let unsure = false;
    for (let up: Element | null = holder; up !== null; up = up.parentElement) {
      const style = getComputedStyle(up);
      const own = Number.parseFloat(style.opacity);
      opacity *= Number.isFinite(own) ? own : 1;
      if (style.backgroundImage !== 'none') unsure = true;
    }
    const ground = tools.ground(holder);
    const [gr, gg, gb] = channels(ground);
    const [r, g, b, alpha] = channels(tools.paint(css.color));
    const cover = alpha * opacity;
    const size = Number.parseFloat(css.fontSize);
    const weight = Number.parseInt(css.fontWeight, 10);
    const held = tools.index(holder);
    texts.push({
      node: held === -1 ? tools.index(control) : held,
      ink: `#${pair(r * cover + gr * (1 - cover))}${pair(g * cover + gg * (1 - cover))}${pair(
        b * cover + gb * (1 - cover),
      )}ff`,
      ground,
      large: size >= 24 || (size >= 18.66 && weight >= 700),
      unsure,
    });
  }
  return texts;
}

/** The texts of a state that differ from the same text at rest (the n-th of a node against the n-th). */
export function changedTexts(rest: readonly StateText[], now: readonly StateText[]): StateText[] {
  const used = new Map<number, number>();
  return now.filter((text) => {
    const nth = used.get(text.node) ?? 0;
    used.set(text.node, nth + 1);
    const before = rest.filter((one) => one.node === text.node)[nth];
    return before === undefined || before.ink !== text.ink || before.ground !== text.ground;
  });
}

/** Both walks of one control: under the pointer, then with focus. */
async function readControl(page: Page, at: number, reads: StateRead[]): Promise<void> {
  const handle = await page.evaluateHandle(controlAt, at);
  const element = handle.asElement();
  if (element === null) return;
  try {
    const { name, on } = await element.evaluate(describeControl);
    const node = await element.evaluate(
      (target) => (window as unknown as FactsWindow).__KITVAS_TOOLS__?.index(target) ?? -1,
    );
    const record = (state: StateRead['state'], texts: StateText[]): void => {
      if (texts.length > 0) reads.push({ node, state, on, name, texts });
    };
    await page.mouse.move(-10, -10);
    const rest = await page.evaluate(readTexts, at);

    const tryHover = async (middle: boolean): Promise<boolean> => {
      const point = await page.evaluate(aim, { at, middle });
      if (point === null) return false;
      await page.mouse.move(point[0], point[1]);
      await page.evaluate(settle);
      if (await page.evaluate(hovered, at)) return true;
      await page.mouse.move(-10, -10);
      return false;
    };
    const over = (await tryHover(false)) || (await tryHover(true));
    if (over) record('hover', changedTexts(rest, await page.evaluate(readTexts, at)));
    await page.mouse.move(-10, -10);
    await page.evaluate(settle);

    await page.keyboard.press('Shift');
    if (await page.evaluate(focusControl, at)) {
      await page.evaluate(settle);
      record('focus', changedTexts(rest, await page.evaluate(readTexts, at)));
    }
    await page.evaluate(blurAll);
  } finally {
    await handle.dispose().catch(() => undefined);
  }
}

/** The controls of the page under the pointer and with focus; nothing is left focused. */
export async function statesPass(page: Page): Promise<StateRead[]> {
  const reads: StateRead[] = [];
  try {
    const count = await page.evaluate(prepareStates, {
      selector: CONTROLS,
      cap: STATE_CONTROL_CAP,
      id: STYLE_ID,
    });
    for (let at = 0; at < count; at += 1) {
      try {
        await readControl(page, at, reads);
      } catch {
        // A control that went away, or a page that is gone: the next one tells which.
        const alive = await page.evaluate(() => true).catch(() => false);
        if (!alive) break;
      }
    }
  } finally {
    await page.mouse.move(-10, -10).catch(() => undefined);
    await page.evaluate(endStates).catch(() => undefined);
  }
  return reads;
}
