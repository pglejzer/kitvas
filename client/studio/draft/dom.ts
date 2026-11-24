// What the draft page's script reads from and writes to the page (shared contract 2). Only the
// studio's own markup is moved in; nothing a frame sends is ever put into the page.

import { compareSummary, type ElementDiff } from './diff.ts';
import type { NoteInfo } from './marks.ts';

/**
 * The regions of the editor screen (plan 15, C4; plan 18, C8) a switch takes from the server's
 * page for the new view. Only their children are replaced: the regions themselves stay, with what
 * the screen's script put on them (a pane's `hidden`, an open menu). `must`: every draft page has it.
 */
const SWAPPED = [
  // The findings of the state and width shown; their numbers match the marks.
  { part: '[data-shell="checks"]', must: true },
  // The bar's count of them.
  { part: '[data-bar-findings]', must: false },
  // The pills' links; the number field and the zoom pill beside them stay as they are.
  { part: '[data-dock="states"]', must: false },
  { part: '[data-dock="widths"]', must: false },
  // The top bar's links to other versions and to compare name the state and width too, and so do
  // the compare links in its More menu.
  { part: '[data-shell="version"]', must: false },
  { part: '[data-shell="compare"]', must: false },
  { part: '[data-shell="more"]', must: false },
] as const;
const STATE_OPTION = '[data-dock="states"] a[data-state]';
const FOCUSABLE = 'a[href], button, summary, input, select, textarea, [tabindex]';

export function readNotes(main: HTMLElement): NoteInfo[] {
  return [...main.querySelectorAll<HTMLElement>('li.note')].map((note) => ({
    element: note.dataset.element,
    label: note.querySelector('.num')?.textContent ?? '',
    tone: note.dataset.tone,
  }));
}

/** The state option a click landed on, inside this page's `main`. */
export function stateLinkOf(
  main: HTMLElement,
  target: EventTarget | null,
): HTMLAnchorElement | undefined {
  if (!(target instanceof Element)) return undefined;
  const link = target.closest(STATE_OPTION);
  return link instanceof HTMLAnchorElement && main.contains(link) ? link : undefined;
}

/** The link's full address when it stays on this studio; `undefined` for any other. */
export function sameOriginHref(link: HTMLAnchorElement): string | undefined {
  if (!link.hasAttribute('href')) return undefined;
  try {
    const url = new URL(link.href, location.href);
    return url.origin === location.origin ? url.href : undefined;
  } catch {
    return undefined;
  }
}

/** `aria-current` on the option of `state` only, as the server marks the current option. */
export function markStateOption(main: HTMLElement, state: string): void {
  for (const option of main.querySelectorAll<HTMLElement>(STATE_OPTION)) {
    if (option.dataset.state === state) option.setAttribute('aria-current', 'true');
    else option.removeAttribute('aria-current');
  }
}

/** Where focus was in a part about to be replaced: the state option, else its place in order. */
type FocusSpot = { part: string; state: string | undefined; index: number };

function focusSpot(main: HTMLElement): FocusSpot | undefined {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement)) return undefined;
  for (const { part } of SWAPPED) {
    const section = main.querySelector(part);
    if (!section?.contains(active)) continue;
    const state = active.matches(STATE_OPTION) ? active.dataset.state : undefined;
    const index = [...section.querySelectorAll(FOCUSABLE)].indexOf(active);
    return { part, state, index };
  }
  return undefined;
}

/** The new markup has the same rows, so focus goes back to the same option or place. */
function restoreFocus(main: HTMLElement, spot: FocusSpot | undefined): void {
  if (!spot) return;
  const section = main.querySelector(spot.part);
  if (!section) return;
  const targets = [...section.querySelectorAll<HTMLElement>(FOCUSABLE)];
  const option = targets.find((item) => item.dataset.state === spot.state);
  const target = (spot.state === undefined ? undefined : option) ?? targets[spot.index];
  target?.focus({ preventScroll: true });
}

/**
 * Puts what the regions of `fresh` (the server's page for `state`) hold in place of what this
 * page's hold. `false`, changing nothing, when `fresh` is not that page or lacks the findings.
 * A region only one of the two pages has is left alone.
 */
export function swapSections(main: HTMLElement, fresh: ParentNode, state: string): boolean {
  const next = fresh.querySelector<HTMLElement>('main.draft-page');
  if (!next || next.dataset.state !== state || next.dataset.draft !== main.dataset.draft) {
    return false;
  }
  const swaps: [Element, Element][] = [];
  for (const { part, must } of SWAPPED) {
    const old = main.querySelector(part);
    const now = next.querySelector(part);
    if (old && now) swaps.push([old, now]);
    else if (must) return false;
  }
  const spot = focusSpot(main);
  for (const [old, now] of swaps) {
    old.replaceChildren(...document.importNode(now, true).childNodes);
  }
  restoreFocus(main, spot);
  return true;
}

/** The compare sentence, from the templates the server put on the summary; empty while unknown. */
export function writeSummary(main: HTMLElement, diff: ElementDiff | undefined): void {
  const summary = main.querySelector<HTMLElement>('p[data-compare-summary]');
  if (!summary) return;
  const { changed = '', added = '', removed = '', same = '' } = summary.dataset;
  const text = diff ? compareSummary(diff, { changed, added, removed, same }) : '';
  // The same sentence again is not news: a live region would read it out twice.
  if (summary.textContent !== text) summary.textContent = text;
}
