// The fold of the drafts list: two rows, then a button for the rest. The page arrives folded
// without a jump: an inline script sets `data-fold` on `<html>` before the first paint, and the
// skin cuts the grid under `:root[data-fold="shut"]`. Without the script nothing is cut and the
// button stays hidden. `client/studio/start/fold.ts` works the button; change both together.

import type { Translate } from '../../../shared/index.ts';
import { type Html, html, trusted } from '../html.ts';
import { icon } from '../icons/icon.ts';

/** The session-storage key of the choice: `open` when the person opened the list. */
export const FOLD_KEY = 'kitvas-fold';

/**
 * Sets `data-fold` on `<html>`: `open` when this tab opened the list, else `shut`. A storage that
 * throws counts as `shut`.
 */
export function foldState(nonce: string): Html {
  const code = `(function(){var v='shut';try{if(sessionStorage.getItem('${FOLD_KEY}')==='open')v='open'}catch(e){}document.documentElement.setAttribute('data-fold',v)})()`;
  return html`<script nonce="${nonce}">${trusted(code)}</script>`;
}

/**
 * The grid of cards and, after it, the button that opens the cut rows. `cards` are the `li`s. The
 * button is hidden until the script finds that something is cut.
 */
export function foldedGrid(t: Translate, cards: Html[]): Html {
  const all = t('studio.start.more.all', { count: cards.length });
  const fewer = t('studio.start.more.fewer');
  return html`<ul class="gallery-grid" data-fold role="list">${cards}</ul><p class="start-more" hidden><button type="button" class="k-btn" data-fold-toggle data-text-all="${all}" data-text-fewer="${fewer}" aria-expanded="false"><span data-fold-label>${all}</span>${icon('chevron-down')}</button></p>`;
}
