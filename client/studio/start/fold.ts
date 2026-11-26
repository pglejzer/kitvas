// The fold of the start page's drafts list (markup: `src/studio/pages/start/fold.ts`, rules:
// `skin/pages/gallery.ts`). The page's inline script has set `data-fold` on `<html>` (`open` or
// `shut`) before the first paint; the skin cuts every kit's grid to two rows. This script finds
// which cards the cut hides and marks them `inert`, shows a group's button only when something is
// cut there, and opens and shuts the lists together. It looks again when a grid's width changes or
// a card comes or goes (a delete, the list swapped after a restore), and lifts the cut while a
// search is typed (`search.ts`). Without it nothing is cut and the buttons stay hidden.

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
  const watched = new Set<HTMLElement>();
  let pending = false;

  const look = (): void => {
    pending = false;
    // Each kit's group has its own grid and its own button, right after it.
    const grids = [...document.querySelectorAll<HTMLElement>('.gallery-grid[data-fold]')];
    for (const old of watched) {
      if (grids.includes(old)) continue;
      resize.unobserve(old);
      watched.delete(old);
    }
    for (const grid of grids) {
      if (watched.has(grid)) continue;
      resize.observe(grid);
      watched.add(grid);
    }
    const open = root.dataset.fold === 'open';
    // While a search is typed the cards that match are all shown, whatever the fold says.
    const searching = document.querySelector('[data-searching]') !== null;
    for (const grid of grids) {
      const holder = grid.nextElementSibling;
      const button = holder?.querySelector<HTMLElement>('[data-fold-toggle]');
      if (!(holder instanceof HTMLElement) || !button) continue;
      const children = [...grid.children].filter(
        (child): child is HTMLElement => child instanceof HTMLElement,
      );
      // A card the search hides takes no place in the rows.
      const cards = children.filter((card) => !card.hidden);
      for (const card of children) {
        if (card.hidden) card.inert = false;
      }
      const columns = columnsOf(cards.map((card) => card.getBoundingClientRect().top));
      const cut = new Set(cutIndexes(columns, cards.length));
      cards.forEach((card, index) => {
        card.inert = !open && !searching && cut.has(index);
      });
      holder.hidden = searching || cut.size === 0;
      showButton(button, open);
    }
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
  if (page) {
    new MutationObserver(later).observe(page, {
      childList: true,
      subtree: true,
      // The search sets and drops `data-searching`, which lifts the cut.
      attributes: true,
      attributeFilter: ['data-searching'],
    });
  }
  look();
}
