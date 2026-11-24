// The filter of counts over the Checks list (plan 18, task D; spec goal 6): All, To fix, To review
// and Accepted, a `.k-seg` the server draws with each count (`src/studio/pages/draft/notes.ts`).
// The choice is kept on the pane host (`data-checks-show`), which a state switch and a full check
// leave in place while they swap its content, so it holds across both; a choice with nothing left
// to show after a swap falls back to All. The skin hides the groups the choice leaves out.

export const CHECKS_FILTERS = ['all', 'fix', 'review', 'accepted'] as const;
export type ChecksFilter = (typeof CHECKS_FILTERS)[number];

/** A filter by its name; anything else is All. */
export const filterOf = (value: string | null | undefined): ChecksFilter =>
  CHECKS_FILTERS.find((one) => one === value) ?? 'all';

/** The choice after the list is drawn again: the one made, unless it has nothing to show now. */
export function keptFilter(
  chosen: ChecksFilter,
  counts: Readonly<Partial<Record<ChecksFilter, number>>>,
): ChecksFilter {
  if (chosen === 'all') return 'all';
  return (counts[chosen] ?? 0) > 0 ? chosen : 'all';
}

/** The counts the filter's buttons carry (`data-count`); a button without one counts 0. */
export function countsOf(
  buttons: readonly { filter: string | undefined; count: string | undefined }[],
): Partial<Record<ChecksFilter, number>> {
  const counts: Partial<Record<ChecksFilter, number>> = {};
  for (const button of buttons) {
    const count = Number(button.count ?? '0');
    counts[filterOf(button.filter)] = Number.isInteger(count) && count > 0 ? count : 0;
  }
  return counts;
}

const BUTTON = 'button[data-checks-filter]';

/**
 * Runs the filter of the page's Checks list. Once per page: a second call (the draft page and
 * the editor may both ask) changes nothing.
 */
export function mountChecksFilter(main: HTMLElement): void {
  const region = main.querySelector<HTMLElement>('[data-shell="checks"]');
  if (!region || region.dataset.checksFilterReady !== undefined) return;
  region.dataset.checksFilterReady = '';
  const buttons = (): HTMLButtonElement[] => [
    ...region.querySelectorAll<HTMLButtonElement>(BUTTON),
  ];

  function show(filter: ChecksFilter): void {
    if (!region) return;
    region.dataset.checksShow = filter;
    for (const button of buttons()) {
      const on = filterOf(button.dataset.checksFilter) === filter;
      button.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  }

  region.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target.closest(BUTTON) : null;
    if (!(target instanceof HTMLButtonElement) || target.disabled) return;
    show(filterOf(target.dataset.checksFilter));
  });
  // A swapped list comes with All pressed: the choice made here is put back on it.
  new MutationObserver(() => {
    const counts = countsOf(
      buttons().map((button) => ({
        filter: button.dataset.checksFilter,
        count: button.dataset.count,
      })),
    );
    show(keptFilter(filterOf(region.dataset.checksShow), counts));
  }).observe(region, { childList: true });
  show(filterOf(region.dataset.checksShow));
}
