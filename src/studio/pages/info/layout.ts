// The frame the Guide, Shortcuts and Doctor pages share, in the start page's look: its column, a
// short block in the inverted scope (the large mark, a line back, the title, the lead and the
// page's own row), the page's cards, the foot line and the page script (`client/studio/page.ts`).

import type { Translate } from '../../../shared/index.ts';
import { logo } from '../brand/logo.ts';
import { type Html, html } from '../html.ts';
import { icon } from '../icons/icon.ts';
import { page } from '../shell.ts';
import type { Skin } from '../skin.ts';
import { type FootCurrent, startFoot } from '../start/foot.ts';
import { commandBox } from '../states/command.ts';

/** What the three pages need of the studio. */
export type InfoDeps = { t: Translate; skin: Skin; version: string };
export type InfoRequest = { nonce: string; host: string };

/** How a command is run by hand, as the README says: there is no global `kitvas` command. */
export const BY_HAND = 'node <plugin folder>/bin/kitvas.ts';

export type InfoFrame = {
  title: string;
  lead: string;
  /** The page's link in the foot line, marked as the current one. */
  current: FootCurrent;
  /** The block's own row (the hint, the counts and buttons); none for the Guide. */
  row?: Html;
  body: Html;
};

/** What the short block shows: the line back (to the start page unless named), the title, the lead and a row. */
export type BlockFrame = {
  title: string;
  lead: string | Html;
  row?: Html;
  back?: { href: string; label: string };
};

export function infoBlock(t: Translate, frame: BlockFrame): Html {
  const { href, label } = frame.back ?? { href: '/', label: t('studio.info.back') };
  const back = html`<a class="info-back" href="${href}">${icon('arrow-left')}<span>${label}</span></a>`;
  return html`<section class="start-block k-inverse info-block">${logo('mark', { className: 'start-giant' })}<div class="start-block-in info-block-in">${back}<h1>${frame.title}</h1><p class="start-lead info-lead">${frame.lead}</p>${frame.row ?? ''}</div></section>`;
}

export function infoPage(deps: InfoDeps, request: InfoRequest, frame: InfoFrame): string {
  const { t, skin } = deps;
  const foot = startFoot({ t, version: deps.version, host: request.host, current: frame.current });
  const script = html`<script type="module" nonce="${request.nonce}" src="/assets/page.js"></script>`;
  return page({
    title: frame.title,
    nonce: request.nonce,
    skin,
    nav: { t, current: null },
    body: html`<main class="k-page start info">${infoBlock(t, frame)}${frame.body}${foot}${script}</main>`,
  });
}

/** A group of cards under a small heading, as the drafts are on `/`. */
export function infoGroup(title: string, content: Html, id?: string): Html {
  const anchor = id === undefined ? '' : html` id="${id}"`;
  return html`<section class="info-group"${anchor}><h2>${title}</h2>${content}</section>`;
}

/** A card that shows one command and what you give and get, as the Guide's skills do. */
export function commandCard(
  t: Translate,
  card: { id: string; name: string; command: string; give: string; get: string },
): Html {
  return html`<li class="info-card info-skill" data-skill="${card.id}"><h3>${card.name}</h3>${commandBox(t, card.command, { copy: true })}<dl class="info-gg"><div><dt>${t('studio.guide.give')}</dt><dd>${card.give}</dd></div><div><dt>${t('studio.guide.get')}</dt><dd>${card.get}</dd></div></dl></li>`;
}
