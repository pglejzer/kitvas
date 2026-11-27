// The parts of a kit's page (markup: `src/studio/pages/kit/`). One part shows at a time, picked on
// the left; typing in the search field shows what it finds in every part instead. A part is
// `[data-view]`, its link `a[data-view-link]`, a thing that can be found `[data-search]` (its
// words), a part's count `[data-view-count]`, the field `[data-kit-search]`, the line for no match
// `[data-search-empty]`, the column the parts stand in `[data-view-main]`. The server hides every
// part but the one the address asks for and the links are real addresses, so the page works
// without the script; the field then does nothing.

import { matches, wordsOf } from '../start/search.ts';

/** A part as the rule sees it: its id and the words of each thing in it. */
export type Part = { id: string; items: readonly string[] };

/** Whether a part shows, and which of its things. */
export type PartShown = { shown: boolean; items: boolean[] };

/**
 * What shows: without a query the current part with all its things; with one, every part that
 * holds a match, with its matches only. `nothing`: a query that matches nowhere.
 */
export function shownParts(
  parts: readonly Part[],
  current: string | undefined,
  query: string,
): { parts: PartShown[]; nothing: boolean } {
  const searching = wordsOf(query).length > 0;
  const shown = parts.map((part) => {
    const items = part.items.map((words) => matches(query, words));
    return { shown: searching ? items.includes(true) : part.id === current, items };
  });
  return { parts: shown, nothing: searching && shown.every((part) => !part.shown) };
}

/** A plain click with the main button: any other opens the link the browser's way. */
const plainClick = (event: MouseEvent): boolean =>
  event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;

/** Brings the start of the parts into sight when it is above the window or below it. */
function reveal(main: HTMLElement): void {
  const column = main.querySelector<HTMLElement>('[data-view-main]');
  if (!column) return;
  const { top } = column.getBoundingClientRect();
  if (top < 0 || top > window.innerHeight / 2) column.scrollIntoView({ block: 'start' });
}

export function mountKitViews(main: HTMLElement): void {
  const views = [...main.querySelectorAll<HTMLElement>('[data-view]')];
  if (views.length === 0) return;
  const things = views.map((view) => [...view.querySelectorAll<HTMLElement>('[data-search]')]);
  const parts: Part[] = views.map((view, at) => ({
    id: view.dataset.view ?? '',
    items: (things[at] ?? []).map((thing) => thing.dataset.search ?? ''),
  }));
  const links = [...main.querySelectorAll<HTMLAnchorElement>('a[data-view-link]')];
  const field = main.querySelector<HTMLInputElement>('[data-kit-search]');
  const none = main.querySelector<HTMLElement>('[data-search-empty]');
  let current = views.find((view) => !view.hidden)?.dataset.view;

  /** Every write is made only on a change, so nothing is laid out again for nothing. */
  const paint = (): void => {
    const query = field?.value ?? '';
    const state = shownParts(parts, current, query);
    views.forEach((view, at) => {
      const part = state.parts[at];
      if (!part) return;
      if (view.hidden === part.shown) view.hidden = !part.shown;
      let hits = 0;
      (things[at] ?? []).forEach((thing, index) => {
        const hit = part.items[index] === true;
        if (thing.hidden === hit) thing.hidden = !hit;
        if (hit) hits += 1;
      });
      const count = view.querySelector('[data-view-count]');
      if (count && count.textContent !== String(hits)) count.textContent = String(hits);
    });
    if (none && none.hidden === state.nothing) none.hidden = !state.nothing;
    const searching = wordsOf(query).length > 0;
    for (const link of links) {
      const here = !searching && link.dataset.viewLink === current;
      if (here !== link.hasAttribute('aria-current')) {
        if (here) link.setAttribute('aria-current', 'true');
        else link.removeAttribute('aria-current');
      }
    }
  };

  main.addEventListener('click', (event) => {
    if (event.defaultPrevented || !plainClick(event) || !(event.target instanceof Element)) return;
    const link = event.target.closest<HTMLAnchorElement>('a[data-view-link]');
    if (!link) return;
    event.preventDefault();
    current = link.dataset.viewLink;
    if (field) field.value = '';
    paint();
    // The address keeps the part, so a reload and a copied link show it again.
    history.replaceState(history.state, '', link.href);
    reveal(main);
  });
  field?.addEventListener('input', paint);
  field?.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || field.value === '') return;
    field.value = '';
    event.preventDefault();
    paint();
  });
  // A field the browser filled again after a reload is searched at once.
  paint();
}
