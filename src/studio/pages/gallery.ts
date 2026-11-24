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
import { type FrameOrigin, frameSrc } from './draft/frame-src.ts';
import { type Html, html } from './html.ts';
import { page } from './shell.ts';
import type { Skin } from './skin.ts';
import { commandBox } from './states/command.ts';

export type GalleryDeps = { drafts: DraftStore; t: Translate; skin: Skin; frame: FrameOrigin };

/** What a page handler passes on from its request. */
export type PageRequest = { query: URLSearchParams; host: string; nonce: string };

/** The command that makes the first draft. */
const FIRST_DRAFT = '/kitvas:compose';

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

/** The dot beside a status: the tone the status words already say, grey when there is nothing yet. */
export function dotOf(status: DraftStatus): 'fix' | 'review' | 'good' | null {
  switch (status.kind) {
    case 'unreadable':
      return 'fix';
    case 'notBuilt':
    case 'notChecked':
      return null;
    case 'checked':
      if (status.fix > 0) return 'fix';
      return status.review > 0 ? 'review' : 'good';
  }
}

function statusMark(t: Translate, status: DraftStatus): Html {
  const line = statusLine(status);
  const state = dotOf(status);
  const dot =
    state === null
      ? html`<span class="k-dot"></span>`
      : html`<span class="k-dot" data-state="${state}"></span>`;
  const words = t(line.key, line.params);
  const tone = line.tone === 'quiet' ? 'k-quiet' : `k-${line.tone}`;
  return html`<span class="gallery-status">${dot}<span class="${tone}">${words}</span></span>`;
}

function card(t: Translate, item: Card): Html {
  // `inert`: the thumbnail is a picture; nothing in it takes focus or reaches screen readers.
  const thumb =
    item.thumb === null
      ? html`<div class="gallery-thumb"></div>`
      : html`<div class="gallery-thumb" inert><iframe src="${item.thumb}" sandbox="allow-scripts" referrerpolicy="no-referrer" loading="lazy" title="${t('studio.page.frame', { title: item.title })}"></iframe></div>`;
  const name =
    item.status.kind === 'unreadable'
      ? html`${item.title}`
      : html`<a class="gallery-name" href="/drafts/${item.slug}">${item.title}</a>`;
  const kind =
    item.kind === null
      ? ''
      : html`<span data-kind="${item.kind}">${t(`studio.kind.${item.kind}`)}</span>`;
  const version =
    item.version > 0
      ? html`<span>${t('studio.page.version', { version: item.version })}</span>`
      : '';
  return html`<li class="gallery-card">${thumb}<h2>${name}</h2><p class="gallery-meta k-meta">${kind}${version}</p>${statusMark(t, item.status)}</li>`;
}

function emptyState(t: Translate): Html {
  return html`<div class="k-empty gallery-empty"><h2>${t('studio.gallery.emptyTitle')}</h2><p>${t('studio.gallery.emptyBody')}</p>${commandBox(t, FIRST_DRAFT, { copy: true })}</div>`;
}

/** The filter as a segmented control of links: the current one is `aria-current`. */
function filter(t: Translate, count: number, attention: number, onlyAttention: boolean): Html {
  const all = onlyAttention
    ? html`<a href="/">${t('studio.gallery.all', { count })}</a>`
    : html`<a href="/" aria-current="true">${t('studio.gallery.all', { count })}</a>`;
  const label = t('studio.gallery.attention', { count: attention });
  const needs = onlyAttention
    ? html`<a href="/?show=attention" aria-current="true">${label}</a>`
    : html`<a href="/?show=attention">${label}</a>`;
  return html`<nav class="k-seg" aria-label="${t('studio.gallery.filter')}">${all}${needs}</nav>`;
}

export function galleryPage(deps: GalleryDeps, request: PageRequest): string {
  const { t } = deps;
  const title = t('studio.page.title');
  const cards = cardsOf(deps, request.host);
  let controls: Html | '' = '';
  let content: Html;
  if (cards.length === 0) {
    content = emptyState(t);
  } else {
    const attention = cards.filter((item) => needsAttention(item.status));
    const onlyAttention = request.query.get('show') === 'attention';
    controls = filter(t, cards.length, attention.length, onlyAttention);
    const shown = onlyAttention ? attention : cards;
    content =
      shown.length === 0
        ? html`<p class="k-quiet">${t('studio.gallery.calm')}</p>`
        : html`<ul class="gallery-grid" role="list">${shown.map((item) => card(t, item))}</ul>`;
  }
  const body = html`<main class="k-page"><header class="gallery-head"><h1>${title}</h1>${controls}</header>${content}<script type="module" src="/assets/gallery.js"></script></main>`;
  return page({
    title,
    nonce: request.nonce,
    skin: deps.skin,
    nav: { t, current: 'drafts' },
    body,
  });
}
