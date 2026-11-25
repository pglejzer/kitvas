// The fold of the start page's drafts list (markup: `src/studio/pages/start/fold.ts`, rules:
// `skin/pages/gallery.ts`). The page's inline script has set `data-fold` on `<html>` (`open` or
// `shut`) before the first paint; the skin cuts the grid to two rows. This script finds which cards
// the cut hides and marks them `inert`, shows the button only when something is cut, and opens and
// shuts the list. It looks again when the grid's width changes or a card comes or goes (a delete,
// the list swapped after a restore). Without it nothing is cut and the button stays hidden.

/** The session-storage key of the choice; the page's inline script reads the same one. */
export const FOLD_KEY = 'kitvas-fold';

/** How many rows of cards the shut list shows. */
export const FOLD_ROWS = 2;

export type FoldState = 'open' | 'shut';

/** The part of a storage the fold uses; a test passes its own. */
export type FoldStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

/** The saved choice; `shut` when none is saved or the storage refuses. */
export function readFold(storage: FoldStorage | undefined): FoldState {
  try {
    return storage?.getItem(FOLD_KEY) === 'open' ? 'open' : 'shut';
  } catch {
    return 'shut';
  }
}

/** Saves the choice for the tab; a storage that refuses is ignored. */
export function saveFold(storage: FoldStorage | undefined, state: FoldState): void {
  try {
    storage?.setItem(FOLD_KEY, state);
  } catch {
    // The choice then lasts only until the page loads again.
  }
}

/** The storage of the tab; `undefined` where the browser does not give it (its getter may throw). */
function tabStorage(): FoldStorage | undefined {
  try {
    return window.sessionStorage;
  } catch {
    return undefined;
  }
}

/** The columns of a grid: the cards that share the first card's top. At least 1. */
export function columnsOf(tops: readonly number[]): number {
  const first = tops[0];
  if (first === undefined) return 1;
  let columns = 0;
  for (const top of tops) {
    if (Math.abs(top - first) > 1) break;
    columns += 1;
  }
  return Math.max(1, columns);
}

/** The indexes of the cards a shut list cuts: every card after the second row. */
export function cutIndexes(columns: number, cards: number): number[] {
  const shown = Math.max(1, columns) * FOLD_ROWS;
  const cut: number[] = [];
  for (let index = shown; index < cards; index += 1) cut.push(index);
  return cut;
}

/** What the button's label and chevron say for a state. */
function showButton(button: HTMLElement, open: boolean): void {
  button.setAttribute('aria-expanded', String(open));
  const label = button.querySelector('[data-fold-label]');
  const words = (open ? button.dataset.textFewer : button.dataset.textAll) ?? '';
  // Only a change is written, so looking again never starts another look.
  if (label && label.textContent !== words) label.textContent = words;
  const use = button.querySelector('use');
  use?.setAttribute('href', open ? '#i-chevron-up' : '#i-chevron-down');
}

export function mountFold(): void {
  const root = document.documentElement;
  const storage = tabStorage();
  if (root.dataset.fold !== 'open' && root.dataset.fold !== 'shut') {
    root.dataset.fold = readFold(storage);
  }
  let watched: Element | null = null;
  let pending = false;

  const look = (): void => {
    pending = false;
    const grid = document.querySelector<HTMLElement>('.gallery-grid[data-fold]');
    const button = document.querySelector<HTMLElement>('[data-fold-toggle]');
    if (grid !== watched) {
      if (watched) resize.unobserve(watched);
      watched = grid;
      if (grid) resize.observe(grid);
    }
    if (!grid || !button) return;
    const open = root.dataset.fold === 'open';
    const cards = [...grid.children].filter(
      (child): child is HTMLElement => child instanceof HTMLElement,
    );
    const columns = columnsOf(cards.map((card) => card.getBoundingClientRect().top));
    const cut = new Set(cutIndexes(columns, cards.length));
    cards.forEach((card, index) => {
      card.inert = !open && cut.has(index);
    });
    const holder = button.parentElement;
    if (holder) holder.hidden = cut.size === 0;
    showButton(button, open);
  };

  const later = (): void => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(look);
  };
  const resize = new ResizeObserver(later);

  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element) || !target.closest('[data-fold-toggle]')) return;
    const next: FoldState = root.dataset.fold === 'open' ? 'shut' : 'open';
    root.dataset.fold = next;
    saveFold(storage, next);
    look();
  });
  // A card that goes (a delete) or a list that is swapped changes what is cut.
  const page = document.querySelector('main');
  if (page) new MutationObserver(later).observe(page, { childList: true, subtree: true });
  look();
}
