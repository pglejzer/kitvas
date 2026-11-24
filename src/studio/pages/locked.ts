// What a browser sees without the page cookie, or with a link that no longer works: one sentence
// and the command that makes a new link. The page has no script, so the command has no copy button.

import type { Translate } from '../../shared/index.ts';
import { html } from './html.ts';
import { page } from './shell.ts';
import type { Skin } from './skin.ts';
import { commandBox } from './states/command.ts';

export type LockedInput = {
  t: Translate;
  nonce: string;
  skin: Skin;
  reason: 'closed' | 'used';
};

/** The command that prints a new link. */
const NEW_LINK = 'kitvas studio';

export function lockedPage(input: LockedInput): string {
  const { t } = input;
  const title = t('studio.page.locked.title');
  const text = t(
    input.reason === 'closed' ? 'studio.page.locked.closed' : 'studio.page.locked.used',
  );
  const body = html`<main class="state-main"><div class="state-card"><h1>${title}</h1><p>${text}</p>${commandBox(t, NEW_LINK, { copy: false })}</div></main>`;
  return page({ title, nonce: input.nonce, skin: input.skin, nav: null, body });
}
