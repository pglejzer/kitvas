// `/kit/<id>` for a kit that cannot be read (`KIT_INVALID`) or is not there (`KIT_NOT_FOUND`): the kit pages'
// frame with the reason and the command that helps. A kit is unreadable while it is being written; an id that is
// not there comes from an old link or a typed address.

import type { KitvasError } from '../../../shared/index.ts';
import { html } from '../html.ts';
import { BY_HAND, infoBlock, infoGroup } from '../info/layout.ts';
import { page } from '../shell.ts';
import { commandBox } from '../states/command.ts';
import { type KitPageDeps, type KitRequest, pageEnd } from './kit-page.ts';

export function kitUnreadablePage(
  deps: KitPageDeps,
  id: string,
  request: KitRequest,
  error: KitvasError,
): string {
  const { t } = deps;
  const missing = error.code === 'KIT_NOT_FOUND';
  const mark = missing ? 'data-kit-missing' : 'data-kit-unreadable';
  const block = infoBlock(t, {
    title: id,
    lead: html`<span class="kit-lead-line" ${mark}>${t(`error.${error.code}`, error.params)}</span>`,
    back: { href: '/kit', label: t('studio.kit.back') },
  });
  const body = missing ? t('studio.kit.missingBody') : t('studio.kit.unreadableBody');
  const command = missing ? `${BY_HAND} kit list` : `${BY_HAND} kit check ${id}`;
  const card = html`<ul class="info-cards kit-add-cards"><li class="info-card"><p>${body}</p>${commandBox(t, command, { copy: true })}</li></ul>`;
  const group = infoGroup(t('studio.kit.unreadableTitle'), card, 'kit-unreadable');
  return page({
    title: id,
    nonce: request.nonce,
    skin: deps.skin,
    nav: { t, current: 'kit' },
    body: html`<main class="k-page start kit-page">${block}${group}${pageEnd(deps, request)}</main>`,
  });
}
