// The icons of a kit's page: every icon beside its name, as the kit draws it. What is drawn and the
// rules that draw it come from `views/kit-icons.ts`; an icon without a picture shows its name alone.

import type { Translate } from '../../../shared/index.ts';
import type { IconsView } from '../../views/kit-icons.ts';
import { type Html, html } from '../html.ts';
import { type Anchor, cardPart } from './kit-token-view.ts';

const ICONS_ID = 'kit-icons';

/** The link to the icons on the page's left; none for a kit that names no icon. */
export function iconsAnchor(t: Translate, view: IconsView): Anchor[] {
  return view.rows.length === 0
    ? []
    : [{ id: ICONS_ID, label: t('studio.kit.section.icons'), count: view.rows.length }];
}

/** The icons as a card: each name, with its picture when the sheet holds it. */
export function iconsSection(t: Translate, view: IconsView): Html | '' {
  if (view.rows.length === 0) return '';
  const items = view.rows.map((row) => {
    const tile = row.drawn
      ? html`<span class="kit-glyph-tile" aria-hidden="true"><span class="kit-glyph" data-icon="${row.name}"></span></span>`
      : '';
    return html`<li class="kit-icon">${tile}<code>${row.name}</code></li>`;
  });
  const note = view.coming
    ? html`<p class="k-quiet" data-icons-note>${t('studio.kit.icons.making')}</p>`
    : '';
  return cardPart(
    ICONS_ID,
    t('studio.kit.section.icons'),
    view.rows.length,
    html`${note}<ul class="kit-icons" role="list">${items}</ul>`,
  );
}
