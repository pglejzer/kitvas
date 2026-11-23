// The paused view (ADR 0042): every page behind the cookie carries it, hidden. Once the studio
// has been gone for a while, the page's script (`client/studio/live.ts`) shows it in place of the
// page, so its texts come from the locale here, never from the script. Change both together.

import type { Translate } from '../../shared/index.ts';
import { type Html, html } from './html.ts';

/** `role="status"` and a focus on show: a screen reader reads it, a keyboard lands on it. */
export function pausedView(t: Translate): Html {
  return html`<div class="paused" data-paused-view role="status" tabindex="-1" hidden><h1>${t('studio.paused.title')}</h1><p>${t('studio.paused.body')}</p></div>`;
}
