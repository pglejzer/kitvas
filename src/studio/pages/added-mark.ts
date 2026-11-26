// The mark of what a project added to its kit (plan 25, C8): a small sign whose tooltip and
// accessible name say that it is not part of the design system. One class (`.k-added`, in the skin's
// controls), one text (`studio.edit.props.added`, which the editor's script reads too), used on a
// theme's value in the Options row and on the kit page's added tokens.

import type { Translate } from '../../shared/index.ts';
import { type Html, html } from './html.ts';
import { icon } from './icons/icon.ts';

/** "Added by this project. Not part of {source}.", `source` from `sourceNoun`. */
export const addedNote = (t: Translate, source: string): string =>
  t('studio.edit.props.added', { source });

/** The sign, with `note` as its name and its tooltip. */
export const addedMark = (note: string): Html =>
  html`<span class="k-added" role="img" aria-label="${note}" title="${note}">${icon('plus')}</span>`;
