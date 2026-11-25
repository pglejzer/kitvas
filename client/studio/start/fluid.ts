// The drafts grid fills its row (rules: `skin/pages/gallery.ts`). A thumbnail is a draft's page,
// 1280 px wide, drawn smaller; its scale depends on the card's width, which CSS cannot divide by
// the page's. This script marks each grid `data-fluid`, so its columns share the row's width, and
// keeps `--thumb-scale` on it. Without the script the columns keep their fixed width and scale.

/** The width a draft's page runs at inside a thumbnail. */
export const THUMB_PAGE_WIDTH = 1280;

/** The scale that draws the page across a thumbnail this wide; `null` for a width not laid out. */
export function thumbScale(width: number): number | null {
  if (!Number.isFinite(width) || width <= 0) return null;
  return Math.round((width / THUMB_PAGE_WIDTH) * 100000) / 100000;
}

export function mountFluid(): void {
  const page = document.querySelector('main');
  if (!page) return;
  let pending = false;

  const look = (): void => {
    pending = false;
    for (const grid of document.querySelectorAll<HTMLElement>('.gallery-grid')) {
      if (!grid.hasAttribute('data-fluid')) grid.setAttribute('data-fluid', '');
      const thumb = grid.querySelector('.gallery-thumb');
      const scale = thumb ? thumbScale(thumb.getBoundingClientRect().width) : null;
      if (scale === null) continue;
      const text = String(scale);
      // Only a change is written, so looking again never starts another look.
      if (grid.style.getPropertyValue('--thumb-scale') !== text) {
        grid.style.setProperty('--thumb-scale', text);
      }
    }
  };
  const later = (): void => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(look);
  };
  // The page's width changes the columns; a list that is swapped (a restore) is a new grid. A
  // resize is heard after layout and before the paint, so the scale is right in the same frame.
  new ResizeObserver(look).observe(page);
  new MutationObserver(later).observe(page, { childList: true, subtree: true });
  look();
}
