// The "Deleted" view of the gallery, the control on a draft's card, and the page a draft that was
// deleted shows (ADR 0064). `client/studio/trash/` works the buttons; the page needs no script to
// read. Times are written in UTC here and replaced by the person's local time by the script.

import type { DeletedDraft } from '../../../drafts/index.ts';
import type { Translate } from '../../../shared/index.ts';
import { type Html, html } from '../html.ts';
import { icon } from '../icons/icon.ts';
import { page } from '../shell.ts';
import type { Skin } from '../skin.ts';
import { trashTexts } from './trash-texts.ts';

/** `2026-11-24T10:15:30.123Z` as `2026-11-24 10:15 UTC`. */
export const utcText = (iso: string): string => `${iso.slice(0, 16).replace('T', ' ')} UTC`;

/** A quiet button on a draft's card; it opens the confirm. */
export function cardDelete(t: Translate, slug: string, title: string): Html {
  const label = t('studio.trash.cardDelete', { title });
  return html`<button type="button" class="k-icon-btn trash-card-del" data-trash-delete data-slug="${slug}" data-title="${title}" aria-label="${label}" title="${label}">${icon('trash')}</button>`;
}

function row(t: Translate, item: DeletedDraft): Html {
  const when = html`<time datetime="${item.deletedAt}" data-trash-time>${utcText(item.deletedAt)}</time>`;
  return html`<li class="trash-row" data-slug="${item.slug}" data-title="${item.title}"><div class="trash-info"><span class="trash-title">${item.title}</span><span class="k-meta">${t('studio.trash.deleted')} ${when}</span></div><div class="trash-actions"><button type="button" class="k-btn" data-trash-restore aria-label="${t('studio.trash.restoreLabel', { title: item.title })}">${t('studio.trash.restore')}</button><button type="button" class="k-btn trash-danger" data-trash-forever aria-label="${t('studio.trash.foreverLabel', { title: item.title })}">${t('studio.trash.forever')}</button></div></li>`;
}

/** The deleted drafts, newest first, each with Restore and Delete forever. */
export function deletedList(t: Translate, items: DeletedDraft[]): Html {
  return html`<ul class="trash-list" role="list" data-trash-list aria-label="${t('studio.trash.listLabel')}">${items.map((item) => row(t, item))}</ul>`;
}

export type DeletedPageInput = {
  t: Translate;
  nonce: string;
  skin: Skin;
  slug: string;
  title: string;
};

/**
 * `/drafts/<slug>` for a draft that is in the trash: it says so, and offers Restore and Back to
 * drafts. A page that was open when the draft went shows this after it loads itself again.
 */
export function deletedPage(input: DeletedPageInput): string {
  const { t, slug, title } = input;
  const heading = t('studio.trash.goneTitle');
  const body = html`<main class="state-main" data-trash-gone data-slug="${slug}" data-title="${title}"><div class="state-card"><h1 tabindex="-1">${heading}</h1><p>${t('studio.trash.goneBody', { title })}</p><div class="trash-actions"><button type="button" class="k-btn k-btn-primary" data-trash-restore>${t('studio.trash.restore')}</button><a class="k-btn" href="/">${t('studio.trash.goneBack')}</a></div></div>${trashTexts({ t, nonce: input.nonce })}<script type="module" src="/assets/gallery.js"></script></main>`;
  return page({
    title,
    nonce: input.nonce,
    skin: input.skin,
    nav: { t, current: 'drafts' },
    body,
  });
}
