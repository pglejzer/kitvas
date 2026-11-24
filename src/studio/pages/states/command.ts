// A command the person is to run, shown the way every page shows one: the text in the code font,
// and a button that copies it (`client/studio/ui/copy.ts` works the button; without the script the
// text is still there to select).

import type { Translate } from '../../../shared/index.ts';
import { type Html, html } from '../html.ts';
import { icon } from '../icons/icon.ts';

/** `copy: false` for a page that has no script (the locked page): the text only. */
export function commandBox(t: Translate, command: string, options: { copy: boolean }): Html {
  const label = t('studio.page.copy');
  const button = options.copy
    ? html`<button type="button" class="k-icon-btn" data-copy aria-label="${label}" title="${label}" data-text-copied="${t('studio.page.copied')}">${icon('copy')}</button><span class="k-sr" role="status" data-copy-status></span>`
    : '';
  return html`<div class="k-cmd"><code>${command}</code>${button}</div>`;
}
