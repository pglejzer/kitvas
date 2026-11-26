// The line above the Properties pane (spec 4c, goal 5): what the live checks say of the selected
// element, in one row of a fixed height that is there for as long as an element is selected. A
// finding that comes or goes changes the row's words and never its height, so nothing under it
// moves while the person is in a drag or a field of the pane. The cards open under the row only
// when the person asks, and the choice is kept in `localStorage` (guarded: the row works without
// it).

import { icon } from '../../ui/icon.ts';
import { el } from '../props/controls/controls.ts';
import type { StorageLike } from '../props/groups/groups.ts';
import type { LiveGroup } from './items.ts';
import { rowNameKey } from './row-words.ts';

export const HERE_KEY = 'kitvas.live.here';

/** Whether the person keeps the cards open; folded when nothing was kept. */
export function readOpen(storage: StorageLike | null): boolean {
  try {
    return storage?.getItem(HERE_KEY) === 'open';
  } catch {
    return false;
  }
}

/** Keeps the choice; a storage that refuses the write leaves it for this page only. */
export function writeOpen(storage: StorageLike | null, open: boolean): void {
  try {
    storage?.setItem(HERE_KEY, open ? 'open' : 'folded');
  } catch {
    // Kept in memory only.
  }
}

/** What the row says, before the words are looked up. */
export type BarWords = {
  /** The count line: its text key and the count it names. */
  key: 'live.here.none' | 'live.here.one' | 'live.here.many' | 'live.here.dismissed';
  count: number;
  /** The dot: the worst finding still standing, `good` with none. */
  tone: 'fix' | 'review' | 'good';
  /** The short name of the first finding still standing (a text key), or its own words. */
  first: { key: string } | { words: string } | null;
  /** There are cards to open: findings, standing or dismissed. */
  cards: boolean;
};

/** Pure: the row's words for the selected element's group (`undefined`: nothing found). */
export function barWords(group: LiveGroup | undefined): BarWords {
  const rows = group?.rows ?? [];
  const standing = rows.filter((row) => !row.waived);
  const [lead] = standing;
  if (lead === undefined) {
    const key = rows.length === 0 ? 'live.here.none' : 'live.here.dismissed';
    return { key, count: rows.length, tone: 'good', first: null, cards: rows.length > 0 };
  }
  const name = rowNameKey(lead);
  return {
    key: standing.length === 1 ? 'live.here.one' : 'live.here.many',
    count: standing.length,
    tone: group?.tone ?? 'review',
    first: name === null ? { words: lead.message } : { key: name },
    cards: true,
  };
}

/**
 * The row: a button that opens and folds the cards when there are any, else a plain line. `tag` is
 * the element's mark on the canvas (`L2`), `cards` the id of the box the button opens.
 */
export function hereBar(options: {
  words: BarWords;
  open: boolean;
  tag: HTMLElement | null;
  cards: string;
  text(key: string, params?: Record<string, string | number>): string;
  onToggle(): void;
}): HTMLElement {
  const { words, text } = options;
  const bar = el(words.cards ? 'button' : 'p', 'checks-here-bar');
  const dot = el('span', 'k-dot');
  dot.dataset.state = words.tone;
  dot.setAttribute('aria-hidden', 'true');
  bar.append(dot, el('span', 'checks-here-count', text(words.key, { count: words.count })));
  if (words.first !== null) {
    const name = 'key' in words.first ? text(words.first.key) : words.first.words;
    bar.append(el('span', 'k-clip checks-here-first', name));
  }
  const end = el('span', 'checks-here-end');
  if (options.tag) end.append(options.tag);
  if (bar instanceof HTMLButtonElement) {
    bar.type = 'button';
    bar.setAttribute('aria-expanded', String(options.open));
    bar.setAttribute('aria-controls', options.cards);
    end.append(icon('chevron-down'));
    bar.addEventListener('click', options.onToggle);
  }
  if (end.childElementCount > 0) bar.append(end);
  return bar;
}
