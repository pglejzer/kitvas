// The paused view (ADR 0042): every page behind the cookie carries it, hidden. Once the studio
// has been gone for a while, the page's script (`client/studio/live/live.ts`) shows it in place of the
// page, so its texts come from the locale here, never from the script. Change both together.

import type { Translate } from '../../shared/index.ts';
import { type Html, html } from './html.ts';
import { commandBox } from './states/command.ts';

/** The command that starts the studio again. */
const START = 'kitvas studio';

/**
 * `role="status"` and a focus on show: a screen reader reads it, a keyboard lands on it. The
 * skin hides every other child of the body while `data-paused` is on it (`skin/pages/states.ts`).
 */
export function pausedView(t: Translate): Html {
  return html`<div class="state-card state-paused k-rise" data-paused-view role="status" tabindex="-1" hidden><h1>${t('studio.paused.title')}</h1><p>${t('studio.paused.body')}</p>${commandBox(t, START, { copy: true })}</div>`;
}
