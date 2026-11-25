// The last line of the start page: the running version, the address, and the three small pages.
// On one of the small pages its own link is the current one.

import type { Translate } from '../../../shared/index.ts';
import { type Html, html, trusted } from '../html.ts';

export type FootCurrent = 'guide' | 'shortcuts' | 'doctor';
export type FootInput = { t: Translate; version: string; host: string; current?: FootCurrent };

export function startFoot(input: FootInput): Html {
  const { t, version, host, current } = input;
  const here = (page: FootCurrent): Html =>
    current === page ? trusted(' aria-current="page"') : trusted('');
  return html`<footer class="start-foot"><span>${t('studio.start.foot.version', { version })}</span><span>${t('studio.start.foot.studio', { host })}</span><a href="/guide"${here('guide')}>${t('studio.start.foot.guide')}</a><a href="/shortcuts"${here('shortcuts')}>${t('studio.start.foot.shortcuts')}</a><a href="/doctor"${here('doctor')}>${t('studio.start.foot.doctor')}</a></footer>`;
}
