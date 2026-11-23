// The pick control of a craft draft: the board itself is the built page; here are the three
// commands that choose a sketch, and after a pick the commands that take the final into the kit.
// The studio only shows them; `kitvas craft` does the work.

import { type Draft, SKETCHES } from '../../drafts/index.ts';
import type { Translate } from '../../shared/index.ts';
import { type Html, html } from './html.ts';

/**
 * Before a pick, one command per sketch; after it, the picked sketch and the commands that add it
 * to the kit or export it (the later versions hold the picked sketch alone). `null` when the draft
 * is not a craft draft.
 */
export function craftPick(t: Translate, draft: Draft): Html | null {
  if (draft.craft === undefined) return null;
  const { picked } = draft.craft;
  const label = t('studio.craft.pickLabel');
  if (picked !== null) {
    const next = [
      `kitvas craft add ${draft.slug}`,
      `kitvas craft export ${draft.slug} --to <folder>`,
    ];
    const items = next.map((command) => html`<li><code>${command}</code></li>`);
    return html`<section class="craft-pick" aria-label="${label}"><h2>${label}</h2><p class="quiet" data-sketch="${picked}"><strong>${t('studio.craft.picked')}</strong> ${t('studio.craft.pickedLine', { sketch: picked })}</p><ul class="plain">${items}</ul></section>`;
  }
  const items = SKETCHES.map(
    (sketch) =>
      html`<li class="pick" data-sketch="${sketch}"><span class="label">${t('studio.craft.sketch', { sketch })}</span><code>kitvas craft pick ${draft.slug} ${sketch}</code></li>`,
  );
  return html`<section class="craft-pick" aria-label="${label}"><h2>${label}</h2><p class="quiet">${t('studio.craft.pickHint')}</p><ul class="plain">${items}</ul></section>`;
}
