// What a browser sees without the page cookie, or with a link that no longer works.

import type { Translate } from '../../shared/index.ts';
import { html } from './html.ts';
import { page } from './shell.ts';

export type LockedInput = {
  t: Translate;
  nonce: string;
  skin: string;
  reason: 'closed' | 'used';
};

export function lockedPage(input: LockedInput): string {
  const { t } = input;
  const title = t('studio.page.locked.title');
  const text = t(
    input.reason === 'closed' ? 'studio.page.locked.closed' : 'studio.page.locked.used',
  );
  const body = html`<main><h1>${title}</h1><p>${text}</p></main>`;
  return page({ title, nonce: input.nonce, skin: input.skin, nav: null, body });
}
