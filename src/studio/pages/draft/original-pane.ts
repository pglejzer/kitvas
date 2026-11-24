// Version 0 of a rework: the original's picture as a card beside the current version (plan 18,
// task A), labelled as the cards are, with its problem count and, when the checks scored the
// version, how many of them are fixed.

import { readBefore } from '../../../checks/index.ts';
import type { DraftStore } from '../../../drafts/index.ts';
import type { Translate } from '../../../shared/index.ts';
import { originalView, type ReworkScore } from '../../views/rework-view.ts';
import { type Html, html } from '../html.ts';
import { readBeforeImage } from './before-files.ts';

export type OriginalInput = {
  t: Translate;
  store: DraftStore;
  slug: string;
  title: string;
  width: number;
  score: ReworkScore | null;
};

/** The card: its label, the picture or the sentence that stands for it, then the counts. */
function originalCard(t: Translate, frame: Html, facts: Html | string): Html {
  const caption = html`<figcaption class="card-caption"><span class="card-name">${t('studio.draft.original')}</span></figcaption>`;
  return html`<figure class="card-box cmp-card" data-card="original">${caption}<div class="card-frame">${frame}</div>${facts}</figure>`;
}

/** The card of version 0; it says so when the original was not saved. */
export function originalPane(input: OriginalInput): Html {
  const { t } = input;
  const before = readBefore(input.store, input.slug);
  if (before === null) {
    return originalCard(
      t,
      html`<div class="k-empty cmp-empty"><p>${t('studio.rework.none')}</p></div>`,
      '',
    );
  }
  const view = originalView(before, input.width);
  const src =
    view.image === null ? undefined : readBeforeImage(input.store, input.slug, view.image);
  const picture =
    src === undefined
      ? html`<div class="k-empty cmp-empty"><p>${t('studio.rework.noPicture')}</p></div>`
      : html`<img class="cmp-shot" src="${src}" alt="${t('studio.rework.alt', { title: input.title })}">`;
  const problems =
    view.problems === null
      ? html`<p>${t('studio.rework.notMeasured')}</p>`
      : html`<p data-original-problems="${view.problems}">${t('studio.rework.problems', { count: view.problems })}</p>`;
  const score =
    input.score === null
      ? ''
      : html`<p>${t('studio.rework.score', { fixed: input.score.fixed, left: input.score.left })}</p>`;
  return originalCard(t, picture, html`<div class="cmp-facts">${problems}${score}</div>`);
}
