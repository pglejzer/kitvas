// `/`: every draft as a live thumbnail of its latest version, with its name, version and status.

import { readChecks } from '../../checks/index.ts';
import {
  type DraftKind,
  type DraftStore,
  listDrafts,
  loadDraft,
  versionInfo,
} from '../../drafts/index.ts';
import type { Translate } from '../../shared/index.ts';
import { type DraftStatus, needsAttention, statusLine, versionStatus } from '../views/status.ts';
import { filterRow } from './controls.ts';
import { type FrameOrigin, frameSrc } from './draft/frame-src.ts';
import { type Html, html } from './html.ts';
import { page } from './shell.ts';

export type GalleryDeps = { drafts: DraftStore; t: Translate; skin: string; frame: FrameOrigin };

/** What a page handler passes on from its request. */
export type PageRequest = { query: URLSearchParams; host: string; nonce: string };

type Card = {
  slug: string;
  title: string;
  /** Screen, rework or craft; null for a draft that cannot be read. */
  kind: DraftKind | null;
  version: number;
  status: DraftStatus;
  /** The frame address of the latest version in its default state; null when it is not built. */
  thumb: string | null;
};

function cardsOf(deps: GalleryDeps, host: string): Card[] {
  return listDrafts(deps.drafts).map((item): Card => {
    if (!item.valid) {
      return {
        slug: item.slug,
        title: item.slug,
        kind: null,
        version: 0,
        status: { kind: 'unreadable' },
        thumb: null,
      };
    }
    const info = versionInfo(deps.drafts, item.slug, item.version);
    const checks = info.built ? readChecks(deps.drafts, item.slug, item.version) : undefined;
    const target = { slug: item.slug, version: item.version, state: info.states.default };
    return {
      slug: item.slug,
      title: item.title ?? item.slug,
      kind: loadDraft(deps.drafts, item.slug).kind,
      version: item.version,
      status: versionStatus(info.built, checks),
      thumb: info.built ? frameSrc(deps.frame, host, target) : null,
    };
  });
}

function card(t: Translate, item: Card): Html {
  const line = statusLine(item.status);
  // `inert`: the thumbnail is a picture; nothing in it takes focus or reaches screen readers.
  const thumb =
    item.thumb === null
      ? html`<div class="thumb"></div>`
      : html`<div class="thumb" inert><iframe src="${item.thumb}" sandbox="allow-scripts" referrerpolicy="no-referrer" loading="lazy" title="${t('studio.page.frame', { title: item.title })}"></iframe></div>`;
  const name =
    item.status.kind === 'unreadable'
      ? html`${item.title}`
      : html`<a href="/drafts/${item.slug}">${item.title}</a>`;
  const version =
    item.version > 0
      ? html`<span>${t('studio.page.version', { version: item.version })}</span>`
      : '';
  const kind =
    item.kind === null
      ? ''
      : html`<p class="kind" data-kind="${item.kind}">${t(`studio.kind.${item.kind}`)}</p>`;
  return html`<li class="card">${thumb}${kind}<h2>${name}</h2><p class="meta">${version}<span class="${line.tone}">${t(line.key, line.params)}</span></p></li>`;
}

export function galleryPage(deps: GalleryDeps, request: PageRequest): string {
  const { t } = deps;
  const title = t('studio.page.title');
  const cards = cardsOf(deps, request.host);
  let content: Html;
  if (cards.length === 0) {
    content = html`<p class="quiet">${t('studio.page.empty')}</p>`;
  } else {
    const attention = cards.filter((item) => needsAttention(item.status));
    const onlyAttention = request.query.get('show') === 'attention';
    const filter = filterRow(t('studio.gallery.filter'), [
      {
        label: t('studio.gallery.all', { count: cards.length }),
        href: '/',
        current: !onlyAttention,
      },
      {
        label: t('studio.gallery.attention', { count: attention.length }),
        href: '/?show=attention',
        current: onlyAttention,
      },
    ]);
    const shown = onlyAttention ? attention : cards;
    const list =
      shown.length === 0
        ? html`<p class="quiet">${t('studio.gallery.calm')}</p>`
        : html`<ul class="gallery" role="list">${shown.map((item) => card(t, item))}</ul>`;
    content = html`${filter}${list}`;
  }
  const body = html`<main><h1>${title}</h1>${content}<script type="module" src="/assets/gallery.js"></script></main>`;
  return page({
    title,
    nonce: request.nonce,
    skin: deps.skin,
    nav: { t, current: 'drafts' },
    body,
  });
}
