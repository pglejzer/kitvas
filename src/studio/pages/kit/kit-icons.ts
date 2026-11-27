// The icons of a kit's page: every icon beside its name, as the kit draws it. What is drawn and the
// rules that draw it come from `views/kit-icons.ts`; an icon without a picture shows its name alone.
// An icon is found by its name (`data-search`).

import type { Translate } from '../../../shared/index.ts';
import type { IconsView } from '../../views/kit-icons.ts';
import { html } from '../html.ts';
import { cardOf, type KitPart } from './kit-token-view.ts';

/** The icons as a part: each name, with its picture when the sheet holds it; none for a kit that names no icon. */
export function iconsParts(t: Translate, view: IconsView): KitPart[] {
  if (view.rows.length === 0) return [];
  const items = view.rows.map((row) => {
    const tile = row.drawn
      ? html`<span class="kit-glyph-tile" aria-hidden="true"><span class="kit-glyph" data-icon="${row.name}"></span></span>`
      : '';
    return html`<li class="kit-icon" data-search="${row.name}">${tile}<code>${row.name}</code></li>`;
  });
  const note = view.coming
    ? html`<p class="k-quiet" data-icons-note>${t('studio.kit.icons.making')}</p>`
    : '';
  const list = html`${note}<ul class="kit-icons" role="list">${items}</ul>`;
  return [cardOf('kit-icons', t('studio.kit.section.icons'), view.rows.length, list)];
}
