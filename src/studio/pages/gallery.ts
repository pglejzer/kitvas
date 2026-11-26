// `/`, the start page: the logo block, then every draft as a live thumbnail of its latest version
// with its name, version, status and when it changed, newest first, in one group a kit
// (`start/groups.ts`) and with a search in the head row (`start/search.ts`). Only the "All" view
// folds each group to two rows (`start/fold.ts`); with no draft the first steps stand in its place.

import { readChecks } from '../../checks/index.ts';
import {
  type DraftKind,
  type DraftStore,
  draftChangedAt,
  listDeleted,
  listDrafts,
  loadDraft,
  versionInfo,
} from '../../drafts/index.ts';
import type { KitStore } from '../../kit/index.ts';
import type { Translate } from '../../shared/index.ts';
import { agoOf, byChange } from '../views/start.ts';
import { type DraftStatus, needsAttention, statusLine, versionStatus } from '../views/status.ts';
import { type FrameOrigin, frameSrc } from './draft/frame-src.ts';
import { type Html, html } from './html.ts';
import { page } from './shell.ts';
import type { Skin } from './skin.ts';
import { kitLabel, startBlock } from './start/block.ts';
import { foldState } from './start/fold.ts';
import { startFoot } from './start/foot.ts';
import { kitGroups, kitWords } from './start/groups.ts';
import { searchField } from './start/search.ts';
import { firstSteps, stepsTitle } from './start/steps.ts';
import { cardDelete, deletedList, utcText } from './trash/trash-list.ts';
import { trashTexts } from './trash/trash-texts.ts';

export type GalleryDeps = {
  drafts: DraftStore;
  /** For the name of the kit the project uses, in the block's facts line. */
  kits: KitStore;
  t: Translate;
  skin: Skin;
  frame: FrameOrigin;
  /** The running kitvas version, for the foot line. */
  version: string;
  /** The id of the kit the project uses; `base` when it chose none. */
  projectKit(): string;
  /** The clock; tests pass their own. */
  now?: () => Date;
};

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
  /** When the draft last changed; null when that cannot be read. */
  changed: Date | null;
  /** The kit the draft names, with its version; null for a draft that cannot be read. */
  kitId: string | null;
  kitVersion: string | null;
  /** What the search looks in: title, slug, kit name and id, kind. */
  words: string;
};

/** A draft whose time cannot be read is shown without one, never left off the page. */
function changedOf(store: DraftStore, slug: string): Date | null {
  try {
    return draftChangedAt(store, slug);
  } catch {
    return null;
  }
}

function cardsOf(deps: GalleryDeps, host: string): Card[] {
  const cards = listDrafts(deps.drafts).map((item): Card => {
    if (!item.valid) {
      return {
        slug: item.slug,
        title: item.slug,
        kind: null,
        version: 0,
        status: { kind: 'unreadable' },
        thumb: null,
        changed: null,
        kitId: null,
        kitVersion: null,
        words: item.slug,
      };
    }
    const info = versionInfo(deps.drafts, item.slug, item.version);
    const checks = info.built ? readChecks(deps.drafts, item.slug, item.version) : undefined;
    const target = { slug: item.slug, version: item.version, state: info.states.default };
    const draft = loadDraft(deps.drafts, item.slug);
    const title = item.title ?? item.slug;
    return {
      slug: item.slug,
      title,
      kind: draft.kind,
      version: item.version,
      status: versionStatus(info.built, checks),
      thumb: info.built ? frameSrc(deps.frame, host, target) : null,
      changed: changedOf(deps.drafts, item.slug),
      kitId: draft.kit.id,
      kitVersion: draft.kit.version,
      words: [
        title,
        item.slug,
        kitWords(deps.kits, draft.kit.id),
        draft.kind,
        deps.t(`studio.kind.${draft.kind}`),
      ].join(' '),
    };
  });
  return byChange(cards);
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

/** When the draft changed, in words, with the exact time in the element. */
function changedMark(t: Translate, changed: Date | null, now: Date): Html {
  if (changed === null) return html``;
  const ago = agoOf(changed, now);
  const iso = changed.toISOString();
  return html`<time datetime="${iso}" title="${utcText(iso)}">${t(ago.key, ago.params)}</time>`;
}

function card(t: Translate, item: Card, now: Date): Html {
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
  return html`<li class="gallery-card" data-search="${item.words}">${thumb}<h3>${name}</h3><p class="gallery-meta k-meta">${kind}${version}${changedMark(t, item.changed, now)}</p>${statusMark(t, item.status)}${cardDelete(t, item.slug, item.title)}</li>`;
}

type Shown = 'all' | 'attention' | 'deleted';

/**
 * The filter as a segmented control of links: the current one is `aria-current`. "Deleted" is
 * there only while some draft is deleted (ADR 0064).
 */
function filter(
  t: Translate,
  counts: { all: number; attention: number; deleted: number },
  shown: Shown,
): Html {
  const link = (view: Shown, href: string, label: string): Html =>
    view === shown
      ? html`<a href="${href}" aria-current="true">${label}</a>`
      : html`<a href="${href}">${label}</a>`;
  const all = link('all', '/', t('studio.gallery.all', { count: counts.all }));
  const needs = link(
    'attention',
    '/?show=attention',
    t('studio.gallery.attention', { count: counts.attention }),
  );
  const gone =
    counts.deleted === 0
      ? ''
      : link(
          'deleted',
          '/?show=deleted',
          t('studio.trash.filterDeleted', { count: counts.deleted }),
        );
  return html`<nav class="k-seg" aria-label="${t('studio.gallery.filter')}">${all}${needs}${gone}</nav>`;
}

export function galleryPage(deps: GalleryDeps, request: PageRequest): string {
  const { t } = deps;
  const title = t('studio.page.title');
  const now = (deps.now ?? (() => new Date()))();
  const cards = cardsOf(deps, request.host);
  const deleted = listDeleted(deps.drafts);
  const asked = request.query.get('show');
  // "Deleted" with nothing deleted shows all the drafts, as an unknown filter does.
  const shown: Shown =
    asked === 'deleted' && deleted.length > 0
      ? 'deleted'
      : asked === 'attention' && cards.length > 0
        ? 'attention'
        : 'all';
  const attention = cards.filter((item) => needsAttention(item.status));
  const segments =
    cards.length === 0 && deleted.length === 0
      ? ''
      : filter(
          t,
          { all: cards.length, attention: attention.length, deleted: deleted.length },
          shown,
        );
  const firstRun = shown === 'all' && cards.length === 0;
  const list = shown === 'attention' ? attention : cards;
  // The search has cards to look in only on the list of drafts.
  const searchable = shown !== 'deleted' && !firstRun && list.length > 0;
  const controls =
    segments === '' && !searchable
      ? ''
      : html`<div class="gallery-tools">${searchable ? searchField(t) : ''}${segments}</div>`;
  let content: Html;
  if (shown === 'deleted') {
    content = deletedList(t, deleted);
  } else if (firstRun) {
    content = firstSteps(t);
  } else if (list.length === 0) {
    content = html`<p class="k-quiet">${t('studio.gallery.calm')}</p>`;
  } else {
    const groups = kitGroups({
      t,
      kits: deps.kits,
      projectKit: deps.projectKit(),
      items: list,
      card: (item) => card(t, item, now),
      fold: shown === 'all',
    });
    content = html`${groups}<p class="k-quiet" data-search-empty hidden>${t('studio.gallery.noMatch')}</p>`;
  }
  const count = cards.length === 0 ? '' : html`<span class="k-count">${cards.length}</span>`;
  const heading = firstRun ? stepsTitle(t) : html`${title}${count}`;
  const lastSlug = cards.find((item) => item.kind !== null)?.slug ?? null;
  const block = startBlock({
    t,
    nonce: request.nonce,
    kitName: kitLabel(deps.kits, deps.projectKit()),
    drafts: cards.length,
    attention: attention.length,
    lastSlug,
  });
  const foot = startFoot({ t, version: deps.version, host: request.host });
  const texts = trashTexts({ t, nonce: request.nonce });
  const body = html`<main class="k-page start">${foldState(request.nonce)}${block}<section class="start-drafts"><header class="gallery-head"><h2>${heading}</h2>${controls}</header><div data-gallery-body>${content}</div></section>${foot}${texts}<script type="module" src="/assets/gallery.js"></script></main>`;
  return page({
    title,
    nonce: request.nonce,
    skin: deps.skin,
    nav: { t, current: 'drafts' },
    body,
  });
}
