// The `press` pass of a visit (ADR 0085): uses the page's own controls and reads what that did.
// A button is clicked, one toggle of a group of toggles, tabs or radios is clicked, a select outside
// a form gets another value, a search field gets text. Links, submit and reset buttons inside a form
// and selects inside a form are never used. A `MutationObserver` on the body tells where the page
// changed: inside the control's own scope (the control, or the group's parent) is `own`; anywhere
// else, a dialog, a new address or focus that moved out of the scope is `page`; nothing is `none`.
// It runs last in a visit: using the controls changes the page for good.
//
// The functions passed to `page.evaluate` use nothing from this module: they share state through
// `window.__KITVAS_PRESS__` and the walk's `window.__KITVAS_TOOLS__`.

import { PRESS_CONTROL_CAP, type PressRead } from '../../domain/page/facts.ts';
import { settle } from '../browser/settle.ts';
import type { FactsWindow } from './playwright-facts-walk.ts';
import { describeControl } from './playwright-states.ts';

type Page = import('playwright-core').Page;

/** What Playwright waits for a control to be ready before it gives up on it. */
const USE_TIMEOUT_MS = 2000;
/** The text typed into a search field. */
const TYPED = 'zz';

type Watch = {
  flags: { own: boolean; outside: boolean };
  before: Element | null;
  href: string;
  observer: MutationObserver;
};
type PressStore = {
  targets: { element: Element; scope: Element }[];
  watch: Watch | null;
};
type PressWindow = FactsWindow & { __KITVAS_PRESS__?: PressStore | undefined };
type Listed = { kind: PressRead['kind']; at: number };
type Seen = { own: boolean; outside: boolean; moved: boolean; address: boolean };

/**
 * Runs in the page: the controls to use, in document order and at most `cap`, kept for the next
 * calls by their place in the list.
 */
export function listPress(cap: number): Listed[] {
  const scope = window as unknown as PressWindow;
  const tools = scope.__KITVAS_TOOLS__;
  if (tools === undefined) throw new Error('the press pass needs the facts walk');
  const usable = (element: Element): boolean =>
    tools.index(element) !== -1 &&
    !tools.hidden(element) &&
    !element.matches(':disabled, [aria-disabled="true"]');
  const isOn = (element: Element): boolean =>
    ['aria-pressed', 'aria-selected', 'aria-checked'].some(
      (key) => element.getAttribute(key) === 'true',
    );
  type Candidate = { kind: PressRead['kind']; element: Element; scope: Element };
  const found: Candidate[] = [];

  // Choices: two or more toggles, tabs, radios or switches of one kind with one parent.
  const groups = new Map<Element, Map<string, Element[]>>();
  const members = Array.from(
    document.querySelectorAll(
      'button[aria-pressed], [role="button"][aria-pressed], [role="tab"], [role="radio"], [role="switch"]',
    ),
  ).filter(usable);
  for (const member of members) {
    const parent = member.parentElement;
    if (parent === null) continue;
    const role = member.getAttribute('role');
    const kind = role === 'tab' || role === 'radio' || role === 'switch' ? role : 'pressed';
    const byKind = groups.get(parent) ?? new Map<string, Element[]>();
    byKind.set(kind, [...(byKind.get(kind) ?? []), member]);
    groups.set(parent, byKind);
  }
  const inChoice = new Set<Element>();
  for (const [parent, byKind] of groups) {
    for (const list of byKind.values()) {
      if (list.length < 2) continue;
      for (const member of list) inChoice.add(member);
      const off = list.find((member) => !isOn(member));
      if (off !== undefined) found.push({ kind: 'choice', element: off, scope: parent });
    }
  }

  for (const element of Array.from(document.querySelectorAll('button, [role="button"]'))) {
    if (inChoice.has(element) || !usable(element)) continue;
    const submits =
      element instanceof HTMLButtonElement &&
      element.form !== null &&
      (element.type === 'submit' || element.type === 'reset');
    if (!submits) found.push({ kind: 'button', element, scope: element });
  }
  for (const element of Array.from(document.querySelectorAll('select'))) {
    if (!(element instanceof HTMLSelectElement) || element.form !== null || !usable(element))
      continue;
    if (Array.from(element.options).filter((option) => !option.disabled).length >= 2) {
      found.push({ kind: 'select', element, scope: element });
    }
  }
  const typed = [
    'input[type="search"]',
    '[role="searchbox"]',
    '[role="search"] input[type="text"]',
    '[role="search"] input:not([type])',
    'search input[type="text"]',
    'search input:not([type])',
  ].join(', ');
  for (const element of Array.from(document.querySelectorAll(typed))) {
    if (!usable(element) || (element instanceof HTMLInputElement && element.readOnly)) continue;
    found.push({ kind: 'search', element, scope: element });
  }

  const once = new Set<Element>();
  const ordered = found
    .filter((one) => !once.has(one.element) && once.add(one.element))
    .sort((a, b) =>
      a.element.compareDocumentPosition(b.element) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
    )
    .slice(0, cap);
  scope.__KITVAS_PRESS__ = {
    targets: ordered.map((one) => ({ element: one.element, scope: one.scope })),
    watch: null,
  };
  return ordered.map((one, at) => ({ kind: one.kind, at }));
}

/** Runs in the page: the control at this place in the list, undefined when it is gone. */
export function pressTarget(at: number): Element | undefined {
  const element = (window as unknown as PressWindow).__KITVAS_PRESS__?.targets[at]?.element;
  return element?.isConnected === true ? element : undefined;
}

/** Runs in the page: a list is kept, so the page is still the one the controls were listed on. */
export function hasPressList(): boolean {
  return (window as unknown as PressWindow).__KITVAS_PRESS__ !== undefined;
}

/** Runs in the page: the first enabled option of the select that is not the chosen one; -1 for none. */
export function otherOption(at: number): number {
  const element = (window as unknown as PressWindow).__KITVAS_PRESS__?.targets[at]?.element;
  if (!(element instanceof HTMLSelectElement)) return -1;
  return Array.from(element.options).findIndex(
    (option, place) => !option.disabled && place !== element.selectedIndex,
  );
}

/** Runs in the page: clicks the control. */
export function clickControl(at: number): void {
  const element = (window as unknown as PressWindow).__KITVAS_PRESS__?.targets[at]?.element;
  if (element instanceof HTMLElement) element.click();
  else element?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
}

/** Runs in the page: starts to watch the body for changes made from now on. */
export function startWatch(at: number): void {
  const store = (window as unknown as PressWindow).__KITVAS_PRESS__;
  const target = store?.targets[at];
  if (store === undefined || target === undefined) return;
  const flags = { own: false, outside: false };
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (target.scope.contains(record.target)) flags.own = true;
      else flags.outside = true;
    }
  });
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    characterData: true,
  });
  store.watch = { flags, before: document.activeElement, href: location.href, observer };
}

/** Runs in the page: what changed since `startWatch`; the watch is over. */
export function readWatch(at: number): Seen {
  const store = (window as unknown as PressWindow).__KITVAS_PRESS__;
  const watch = store?.watch;
  const target = store?.targets[at];
  if (store === undefined || watch === null || watch === undefined || target === undefined) {
    return { own: false, outside: false, moved: false, address: false };
  }
  for (const record of watch.observer.takeRecords()) {
    if (target.scope.contains(record.target)) watch.flags.own = true;
    else watch.flags.outside = true;
  }
  watch.observer.disconnect();
  store.watch = null;
  const active = document.activeElement;
  return {
    own: watch.flags.own,
    outside: watch.flags.outside,
    moved:
      active !== null &&
      active !== watch.before &&
      active !== document.body &&
      !target.scope.contains(active),
    address: location.href !== watch.href,
  };
}

/** Runs in the page: the list and any watch dropped. */
export function endPress(): void {
  const scope = window as unknown as PressWindow;
  scope.__KITVAS_PRESS__?.watch?.observer.disconnect();
  scope.__KITVAS_PRESS__ = undefined;
}

/** What one use did, from what the page saw and the dialogs that opened. */
export function effectOf(seen: Seen, dialogs: number): PressRead['effect'] {
  if (seen.outside || seen.moved || seen.address || dialogs > 0) return 'page';
  return seen.own ? 'own' : 'none';
}

/** Uses one control and gives what it did; null when it could not be used. */
async function pressOne(
  page: Page,
  { kind, at }: Listed,
  dialogs: { count: number },
): Promise<PressRead | null> {
  const handle = await page.evaluateHandle(pressTarget, at);
  const element = handle.asElement();
  if (element === null) return null;
  try {
    const node = await element.evaluate(
      (target) => (window as unknown as FactsWindow).__KITVAS_TOOLS__?.index(target) ?? -1,
    );
    const { name } = await element.evaluate(describeControl);
    await element.scrollIntoViewIfNeeded({ timeout: USE_TIMEOUT_MS });
    const opened = dialogs.count;
    await page.evaluate(startWatch, at);
    try {
      if (kind === 'select') {
        const index = await page.evaluate(otherOption, at);
        if (index === -1) return null;
        await element.selectOption({ index }, { timeout: USE_TIMEOUT_MS });
      } else if (kind === 'search') {
        await element.fill(TYPED, { timeout: USE_TIMEOUT_MS });
      } else {
        await page.evaluate(clickControl, at);
      }
      await page.evaluate(settle);
    } catch (error) {
      await page.evaluate(readWatch, at).catch(() => undefined);
      throw error;
    }
    const seen = await page.evaluate(readWatch, at);
    return { node, kind, name, effect: effectOf(seen, dialogs.count - opened) };
  } finally {
    await handle.dispose().catch(() => undefined);
  }
}

/** What using each control did, last in a visit; the page stays as the uses left it. */
export async function pressPass(page: Page): Promise<PressRead[]> {
  const reads: PressRead[] = [];
  const dialogs = { count: 0 };
  const onDialog = (dialog: import('playwright-core').Dialog): void => {
    dialogs.count += 1;
    dialog.dismiss().catch(() => undefined);
  };
  page.on('dialog', onDialog);
  try {
    const listed = await page.evaluate(listPress, PRESS_CONTROL_CAP);
    for (const item of listed) {
      // A page that navigated away has lost the list: the pass ends with what it has.
      if (!(await page.evaluate(hasPressList).catch(() => false))) break;
      try {
        const read = await pressOne(page, item, dialogs);
        if (read !== null) reads.push(read);
      } catch {
        // A use that threw is skipped.
      }
    }
  } finally {
    page.off('dialog', onDialog);
    await page.evaluate(endPress).catch(() => undefined);
  }
  return reads;
}
