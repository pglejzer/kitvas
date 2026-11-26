// A finding dismissed since the last full check leaves its group at once (the owner asked for a way
// to remove a finding). The server draws the pane from the last check; this puts the picture right
// from `store.waivers`, after every change of them and every swap of the pane (`live/waivers.ts`):
// the card moves to the dismissed group at the end of the list, the group it left and its tile count
// one less, the dismissed count one more, a group with no card is hidden. A restore puts the card
// back in its group by its number. The arithmetic is `dismissed.ts`; the markup written here is the
// server's (`src/studio/pages/draft/notes.ts`), so the filter and its buttons work on it.

import type { Waiver } from '../../../../src/studio/api/waivers/waiver-schemas.ts';
import { noteKey, waiverOf } from '../live/waiver-rules.ts';
import { el } from '../props/controls.ts';
import { text } from '../texts.ts';
import { type CardInfo, dismissLayout, insertionIndex, type Tone } from './dismissed.ts';

const CARDS = 'li.note, li.accepted-note';

const numberOf = (card: Element): number => Number(card.querySelector('.checks-num')?.textContent);

function infoOf(card: HTMLElement): CardInfo {
  const key = noteKey({
    rule: card.dataset.rule ?? null,
    element: card.dataset.element,
    waivedElement: card.dataset.waivedElement,
  });
  const tone = card.dataset.tone;
  if (!card.classList.contains('note')) return { key, tone: null };
  return { key, tone: tone === 'fix' || tone === 'review' ? tone : null };
}

/** Sets a text only when it differs, so the pane's own observers see no change when none was made. */
function say(node: Element, words: string): void {
  if (node.textContent !== words) node.textContent = words;
}

function groupOf(list: Element, name: string): HTMLElement | null {
  return list.querySelector<HTMLElement>(`:scope > [data-checks-group="${name}"]`);
}

/** The dismissed group, drawn as the server draws it, after the last group of the list. */
function acceptedGroup(list: Element): HTMLElement {
  const held = groupOf(list, 'accepted');
  if (held) return held;
  const group = el('div', 'checks-group');
  group.dataset.checksGroup = 'accepted';
  const title = el('h2', 'checks-group-title');
  const stack = el('ol', 'k-stack');
  stack.setAttribute('role', 'list');
  group.append(title, stack);
  const groups = list.querySelectorAll(':scope > .checks-group');
  const last = groups[groups.length - 1];
  if (last) last.after(group);
  else list.prepend(group);
  return group;
}

/** The card as a dismissed one: the dot for its number, the reason line; the rest the skin hides. */
function dismiss(card: HTMLElement, reason: string): void {
  const head = card.querySelector('.checks-finding-head');
  if (head && !head.querySelector('[data-checks-dot]')) {
    const dot = el('span', 'k-dot');
    dot.dataset.state = 'good';
    dot.dataset.checksDot = '';
    dot.setAttribute('aria-hidden', 'true');
    head.prepend(dot);
  }
  let line = card.querySelector<HTMLElement>(':scope > .checks-reason');
  if (!line) {
    line = el('p', 'k-meta checks-reason');
    (card.querySelector('.checks-details') ?? card.lastElementChild)?.before(line);
  }
  say(line, text('checks.reason', { reason }));
}

function restore(card: HTMLElement): void {
  card.querySelector('[data-checks-dot]')?.remove();
  card.querySelector(':scope > .checks-reason')?.remove();
}

/** Where `card` goes in `stack`: by its number among the cards it holds. */
function place(stack: Element, card: HTMLElement): void {
  const held = [...stack.children].filter((one) => one !== card);
  const index = insertionIndex(held.map(numberOf), numberOf(card));
  const before = held[index] ?? null;
  if (before === null) {
    if (card.parentElement !== stack || card !== stack.lastElementChild) stack.append(card);
  } else if (card.nextElementSibling !== before || card.parentElement !== stack) {
    before.before(card);
  }
}

function tile(region: HTMLElement, tone: Tone, count: number): void {
  const button = region.querySelector<HTMLButtonElement>(`button[data-checks-filter="${tone}"]`);
  if (!button) return;
  button.dataset.count = String(count);
  const number = button.querySelector('.checks-tile-count');
  if (number) say(number, String(count));
  // A tile left with nothing to show cannot stay chosen: let it go first, then it is disabled.
  if (count === 0 && button.getAttribute('aria-pressed') === 'true' && !button.disabled) {
    button.click();
  }
  button.disabled = count === 0;
}

/** The chip of the dismissed ones in the head: made when missing, taken away when none. */
function chip(region: HTMLElement, count: number): void {
  const held = region.querySelector<HTMLButtonElement>('button[data-checks-filter="accepted"]');
  if (count === 0) {
    if (held?.getAttribute('aria-pressed') === 'true') held.click();
    held?.remove();
    return;
  }
  const words = `${text('checks.filter.accepted')} ${count}`;
  if (held) {
    held.dataset.count = String(count);
    say(held, words);
    return;
  }
  const head = region.querySelector('.checks-head');
  if (!head) return;
  const made = el('button', 'k-btn k-btn-line checks-accepted', words);
  made.type = 'button';
  made.dataset.checksFilter = 'accepted';
  made.dataset.count = String(count);
  made.setAttribute('aria-pressed', region.dataset.checksShow === 'accepted' ? 'true' : 'false');
  const score = head.querySelector('.checks-score');
  if (score) score.after(made);
  else head.append(made);
}

/** Puts the pane right for these waivers; the same step after a waiver changed and after a swap. */
export function applyDismissals(region: HTMLElement, waivers: readonly Waiver[]): void {
  const list = region.querySelector('.checks-list');
  if (!list) return;
  const cards = [...list.querySelectorAll<HTMLElement>(CARDS)];
  const layout = dismissLayout(cards.map(infoOf), waivers);
  cards.forEach((card, index) => {
    if (!card.classList.contains('note')) return;
    const inside = card.closest('[data-checks-group]')?.getAttribute('data-checks-group');
    if (layout.dismissed[index]) {
      const key = infoOf(card).key;
      const waiver = key === null ? undefined : waiverOf(waivers, key);
      if (waiver) dismiss(card, waiver.reason);
      // It goes to the end of the dismissed group, after those dismissed before it.
      if (inside !== 'accepted') (acceptedGroup(list).querySelector('ol') ?? list).append(card);
    } else if (inside === 'accepted') {
      restore(card);
      const home = groupOf(list, card.dataset.tone ?? '');
      const stack = home?.querySelector('ol');
      if (stack) place(stack, card);
    }
  });
  for (const name of ['fix', 'review', 'accepted'] as const) {
    const group = groupOf(list, name);
    if (!group) continue;
    group.hidden = !layout.shown[name];
    const title = group.querySelector('.checks-group-title');
    if (title) say(title, text(`checks.group.${name}`, { count: layout.counts[name] }));
  }
  tile(region, 'fix', layout.counts.fix);
  tile(region, 'review', layout.counts.review);
  chip(region, layout.counts.accepted);
}
