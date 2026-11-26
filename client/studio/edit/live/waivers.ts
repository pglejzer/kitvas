// Waivers (spec 4c, goal 6; plan 16, task E): dismiss a finding on purpose, with a reason, and
// restore it. `store.waivers` holds the draft's waivers (`GET …/waivers`). Every finding row has a
// dismissal (`dismiss.ts`): the Checks list's rows get one from `mountWaivers`, and the Live
// section (task C) puts its own on each live finding. A dismissed finding shows as dismissed and is
// never marked. The rules with no page in them are in `waiver-rules.ts`.

import { getWaivers } from '../api.ts';
import { applyDismissals } from '../checks/dismissed-view.ts';
import type { EditorContext } from '../context.ts';
import { CONTROL, dismissControl } from './dismiss.ts';
import { mountChecksFilter } from './filter.ts';
import { noteKey, type WaiverKey, waiverOf } from './waiver-rules.ts';

export {
  MAX_REASON,
  noteKey,
  QUICK_REASON_KEYS,
  type ReasonProblem,
  type ReasonRequest,
  reasonProblem,
  reasonRequest,
  type WaiverKey,
  waiverOf,
} from './waiver-rules.ts';

/** The rows of the Checks list the controls go on: the numbered notes and the dismissed ones. */
const ROWS = 'li.note, li.accepted-note';

/** The rule is the row's `data-rule` (plan 18), else the first `<code>` of its details. */
function rowKey(row: HTMLElement): WaiverKey | null {
  return noteKey({
    rule: row.dataset.rule ?? row.querySelector('code')?.textContent ?? null,
    element: row.dataset.element,
    waivedElement: row.dataset.waivedElement,
  });
}

/**
 * Puts a dismissal on each row that has none, and marks the rows the store dismisses: `data-waived`,
 * and the element id moved to `data-waived-element`, so the canvas marks (read from `data-element`)
 * leave it out the next time they are read. A numbered card has its icon button in the head and its
 * row in `[data-checks-dismiss]`; a dismissed card has only Restore, in its actions.
 */
export function decorateRows(ctx: EditorContext, region: HTMLElement): void {
  const { waivers } = ctx.store.get();
  for (const row of region.querySelectorAll<HTMLElement>(ROWS)) {
    const key = rowKey(row);
    if (!key) continue;
    if (row.classList.contains('note')) {
      const dismissed = waiverOf(waivers, key) !== undefined;
      row.toggleAttribute('data-waived', dismissed);
      if (dismissed && row.dataset.element !== undefined) {
        row.dataset.waivedElement = row.dataset.element;
        delete row.dataset.element;
      } else if (!dismissed && row.dataset.waivedElement !== undefined) {
        row.dataset.element = row.dataset.waivedElement;
        delete row.dataset.waivedElement;
      }
    }
    if (row.querySelector(`.${CONTROL}`)) continue;
    const trigger = row.querySelector<HTMLButtonElement>('[data-checks-dismiss-toggle]');
    // A card has its own reason line (the server's, or `dismissed-view.ts`'s): only Restore here.
    const { panel } = dismissControl(ctx, key, {
      ...(trigger ? { trigger } : {}),
      showReason: false,
    });
    const place =
      row.querySelector('[data-checks-dismiss]') ??
      row.querySelector('[data-checks-actions]') ??
      row.querySelector(':scope > div');
    (place ?? row).append(panel);
  }
  // The same picture whether the server drew these waivers or they were made since.
  applyDismissals(region, waivers);
}

export function mountWaivers(ctx: EditorContext): void {
  const { main, store, slug } = ctx;
  const load = (): void => {
    void getWaivers(slug).then((answer) => {
      if (answer.ok) store.set({ waivers: answer.body.waivers });
    });
  };
  load();
  // An edit can rename elements (ADR 0052): the server answers the waivers by the new ids.
  store.subscribe((state, previous) => {
    if (state.applied !== previous.applied) load();
  });
  const region = main.querySelector<HTMLElement>('[data-shell="checks"]');
  if (!region) return;
  // The filter of counts over the same list (plan 18); the draft page may run it already.
  mountChecksFilter(main);
  let queued = false;
  const again = (): void => {
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      decorateRows(ctx, region);
    });
  };
  // The list is swapped as a whole when the state changes or a full check ends.
  new MutationObserver(again).observe(region, { childList: true, subtree: true });
  store.subscribe((state, previous) => {
    if (state.waivers !== previous.waivers) again();
  });
  again();
}
