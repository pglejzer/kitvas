// The search field in the "Drafts" head row: the studio's own field with the search icon in it.
// `client/studio/start/search.ts` filters the cards as the person types (`data-gallery-search`,
// the cards' `data-search`); change both together. Without the script the field does nothing.

import type { Translate } from '../../../shared/index.ts';
import { type Html, html } from '../html.ts';
import { icon } from '../icons/icon.ts';

export function searchField(t: Translate): Html {
  const label = t('studio.gallery.search');
  return html`<label class="k-search gallery-search">${icon('search')}<input class="k-field" type="search" data-gallery-search placeholder="${label}" aria-label="${label}" autocomplete="off" spellcheck="false"></label>`;
}
