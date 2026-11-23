// The pick control of a craft draft: the board itself is the built page; here are the three
// commands that choose a sketch. The studio only shows them; `kitvas craft pick` does the work.

import { type Draft, SKETCHES } from '../../drafts/index.ts';
import type { Translate } from '../../shared/index.ts';
import { type Html, html } from './html.ts';

/** The commands, one per sketch; `null` when the draft is not a craft draft. */
export function craftPick(t: Translate, draft: Draft): Html | null {
  if (draft.craft === undefined) return null;
  const { picked } = draft.craft;
  const head =
    picked === null ? t('studio.craft.pickHint') : t('studio.craft.pickedLine', { sketch: picked });
  const items = SKETCHES.map((sketch) => {
    const state = picked === sketch ? html` <strong>${t('studio.craft.picked')}</strong>` : '';
    return html`<li class="pick" data-sketch="${sketch}"><span class="label">${t('studio.craft.sketch', { sketch })}</span><code>kitvas craft pick ${draft.slug} ${sketch}</code>${state}</li>`;
  });
  return html`<section class="craft-pick" aria-label="${t('studio.craft.pickLabel')}"><h2>${t('studio.craft.pickLabel')}</h2><p class="quiet">${head}</p><ul class="plain">${items}</ul></section>`;
}
