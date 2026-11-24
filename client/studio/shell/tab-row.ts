// The right panel's tab row (plan 18): one line that never wraps. In a panel too narrow for its
// tabs the row scrolls sideways, without a bar: a wheel turned over it moves it, and the tab picked
// is brought into view.

type Span = { left: number; right: number };

/** How far the row scrolls for `tab` to be whole in it: negative to the left, 0 when it is. */
export function tabShift(row: Span, tab: Span): number {
  if (tab.left < row.left) return tab.left - row.left;
  if (tab.right > row.right) return tab.right - row.right;
  return 0;
}

/** Brings a tab into view in its row. Only the row moves, never the panel around it. */
export function showTab(tab: HTMLElement): void {
  const row = tab.parentElement;
  if (!row) return;
  const box = row.getBoundingClientRect();
  // A folded panel has no row to scroll.
  if (box.width === 0) return;
  // The first and the last tab bring the row's own padding with them.
  if (tab === row.firstElementChild) row.scrollLeft = 0;
  else if (tab === row.lastElementChild) row.scrollLeft = row.scrollWidth;
  else row.scrollLeft += tabShift(box, tab.getBoundingClientRect());
}

export function mountTabRow(row: HTMLElement): void {
  row.addEventListener(
    'wheel',
    (event) => {
      // A wheel that turns sideways already, and a row that shows every tab, are left alone.
      if (event.deltaX !== 0 || event.deltaY === 0 || row.scrollWidth <= row.clientWidth) return;
      row.scrollLeft += event.deltaY;
      event.preventDefault();
    },
    { passive: false },
  );
}
