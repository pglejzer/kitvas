// The counts after the right tabs' labels (plan 18f, task 3; spec 4.10): `Changes 3` and
// `Checks 2` (to fix). The page draws each count span empty (`data-tab-count`), so the tabs do not
// shift on load; this fills them. Changes counts the lines of the session's list; Checks reads the
// "to fix" count the Checks pane already holds on the page (its filter button's `data-count`), and
// follows that pane when it changes.

import type { EditorContext } from '../context.ts';

/** The count a tab shows: nothing for none. */
export const countWords = (count: number): string => (count > 0 ? String(count) : '');

/**
 * How many findings are to fix, from the Checks pane's markup: the "to fix" filter's `data-count`,
 * else the findings listed under the fix group. `null` when the pane holds neither.
 */
export function fixCountOf(pane: ParentNode): number | null {
  const filter = pane.querySelector('[data-checks-filter="fix"]');
  const held = Number(filter?.getAttribute('data-count'));
  if (filter !== null && Number.isInteger(held) && held >= 0) return held;
  const group = pane.querySelector('[data-checks-group="fix"]');
  return group === null ? null : group.querySelectorAll('li').length;
}

export function mountTabCounts(ctx: EditorContext): void {
  const changes = ctx.panel.querySelector<HTMLElement>('[data-tab-count="changes"]');
  const checks = ctx.panel.querySelector<HTMLElement>('[data-tab-count="checks"]');
  if (changes) {
    const drawChanges = (): void => {
      changes.textContent = countWords(ctx.store.get().changes.length);
    };
    ctx.store.subscribe((state, previous) => {
      if (state.changes !== previous.changes) drawChanges();
    });
    drawChanges();
  }
  const pane = ctx.panel.querySelector('[data-shell="checks"]');
  if (checks && pane) {
    const drawChecks = (): void => {
      const count = fixCountOf(pane) ?? 0;
      checks.textContent = countWords(count);
      if (count > 0) checks.dataset.tone = 'fix';
      else checks.removeAttribute('data-tone');
    };
    drawChecks();
    // The pane is drawn by the page and again by the full check's run: follow what it holds.
    if (typeof MutationObserver !== 'undefined') {
      new MutationObserver(drawChecks).observe(pane, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['data-count'],
      });
    }
  }
}
