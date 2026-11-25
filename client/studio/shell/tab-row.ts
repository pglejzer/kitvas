// The right panel's tab row (plan 18): one line that never wraps. At the panel's own width every
// tab shows whole. In a panel made narrower the row scrolls sideways, without a bar: pressed and
// dragged with the mouse it follows the pointer, a wheel turned over it moves it, and the tab
// picked is brought into view.

type Span = { left: number; right: number };

/** How far the pointer moves before a press on the row is a drag, not a click on a tab. */
export const DRAG_PX = 4;

/** How far the row scrolls for `tab` to be whole in it: negative to the left, 0 when it is. */
export function tabShift(row: Span, tab: Span): number {
  if (tab.left < row.left) return tab.left - row.left;
  if (tab.right > row.right) return tab.right - row.right;
  return 0;
}

/**
 * Where a drag puts the row: pressed at `from` with the row at `left`, the pointer now at `x`.
 * `null` while the pointer has moved less than `DRAG_PX` and the press is still a click.
 */
export function dragLeft(press: { from: number; left: number }, x: number): number | null {
  const moved = x - press.from;
  if (Math.abs(moved) < DRAG_PX) return null;
  return press.left - moved;
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
  const scrolls = (): boolean => row.scrollWidth > row.clientWidth;
  row.addEventListener(
    'wheel',
    (event) => {
      // A wheel that turns sideways already, and a row that shows every tab, are left alone.
      if (event.deltaX !== 0 || event.deltaY === 0 || !scrolls()) return;
      row.scrollLeft += event.deltaY;
      event.preventDefault();
    },
    { passive: false },
  );

  // Pressed and dragged sideways with the mouse, the row follows; a drag never picks a tab.
  let press: { from: number; left: number; pointer: number } | null = null;
  let dragged = false;
  row.addEventListener('pointerdown', (event) => {
    if (event.pointerType !== 'mouse' || event.button !== 0 || !scrolls()) return;
    press = { from: event.clientX, left: row.scrollLeft, pointer: event.pointerId };
    dragged = false;
  });
  row.addEventListener('pointermove', (event) => {
    if (press === null || event.pointerId !== press.pointer) return;
    const left = dragLeft(press, event.clientX);
    if (left === null) return;
    if (!dragged) row.setPointerCapture(press.pointer);
    dragged = true;
    row.scrollLeft = left;
  });
  const end = (): void => {
    press = null;
  };
  row.addEventListener('pointerup', end);
  row.addEventListener('pointercancel', end);
  row.addEventListener(
    'click',
    (event) => {
      if (!dragged) return;
      dragged = false;
      event.preventDefault();
      event.stopPropagation();
    },
    true,
  );
}
