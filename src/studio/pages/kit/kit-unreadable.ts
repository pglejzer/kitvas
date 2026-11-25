// `/kit/<id>` for a kit that cannot be read (`KIT_INVALID`): the kit pages' frame with the reason
// and the command that says what is wrong. A kit is in this state while it is being written.

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
  const block = infoBlock(t, {
    title: id,
    lead: html`<span class="kit-lead-line" data-kit-unreadable>${t(`error.${error.code}`, error.params)}</span>`,
    back: { href: '/kit', label: t('studio.kit.back') },
  });
  const card = html`<ul class="info-cards kit-add-cards"><li class="info-card"><p>${t('studio.kit.unreadableBody')}</p>${commandBox(t, `${BY_HAND} kit check ${id}`, { copy: true })}</li></ul>`;
  const group = infoGroup(t('studio.kit.unreadableTitle'), card, 'kit-unreadable');
  return page({
    title: id,
    nonce: request.nonce,
    skin: deps.skin,
    nav: { t, current: 'kit' },
    body: html`<main class="k-page start kit-page">${block}${group}${pageEnd(deps, request)}</main>`,
  });
}
