// Version 0 of a rework: the original's picture beside the current version, with its problem
// count and, when the checks scored the version, how many of them are fixed.

import { readBefore } from '../../checks/index.ts';
import type { DraftStore } from '../../drafts/index.ts';
import type { Translate } from '../../shared/index.ts';
import { originalView, type ReworkScore } from '../views/rework-view.ts';
import { readBeforeImage } from './before-files.ts';
import { type Html, html } from './html.ts';

export type OriginalInput = {
  t: Translate;
  store: DraftStore;
  slug: string;
  title: string;
  width: number;
  score: ReworkScore | null;
};

/** The pane of version 0; it says so when the original was not saved. */
export function originalPane(input: OriginalInput): Html {
  const { t } = input;
  const caption = html`<p class="caption">${t('studio.draft.original')}</p>`;
  const before = readBefore(input.store, input.slug);
  if (before === null) {
    return html`<div class="pane"><p>${t('studio.rework.none')}</p>${caption}</div>`;
  }
  const view = originalView(before, input.width);
  const src =
    view.image === null ? undefined : readBeforeImage(input.store, input.slug, view.image);
  const picture =
    src === undefined
      ? html`<p>${t('studio.rework.noPicture')}</p>`
      : html`<div class="frame-box"><img class="original-shot" src="${src}" alt="${t('studio.rework.alt', { title: input.title })}"></div>`;
  const problems =
    view.problems === null
      ? html`<p>${t('studio.rework.notMeasured')}</p>`
      : html`<p data-original-problems="${view.problems}">${t('studio.rework.problems', { count: view.problems })}</p>`;
  const score =
    input.score === null
      ? ''
      : html`<p>${t('studio.rework.score', { fixed: input.score.fixed, left: input.score.left })}</p>`;
  return html`<div class="pane">${picture}${caption}${problems}${score}</div>`;
}
