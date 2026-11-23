// The stage of a draft page: the framed version, or two versions side by side when comparing.

import type { Translate } from '../../shared/index.ts';
import { newChannel } from '../security/token.ts';
import type { Width } from '../views/draft-query.ts';
import { withChannel } from './frame-channel.ts';
import { type Html, html } from './html.ts';

type FrameInput = {
  t: Translate;
  /** The frame address without the channel. */
  src: string;
  host: string;
  width: Width;
  title: string;
  role: 'current' | 'before';
};

/** Fresh channel ids on every render: they only tell the frames of one page apart. */
function frameBox(input: FrameInput): Html {
  const channel = newChannel();
  const src = withChannel(input.src, channel, input.host);
  return html`<div class="frame-box"><iframe src="${src}" width="${input.width}" sandbox="allow-scripts" referrerpolicy="no-referrer" title="${input.title}" data-frame="${input.role}" data-channel="${channel}"></iframe></div>`;
}

export type StageInput = {
  t: Translate;
  host: string;
  width: Width;
  /** The page's title: the draft's name. */
  name: string;
  version: number;
  built: boolean;
  src: string;
  slug: string;
  /** The compared version, its frame address and whether it is built; null without compare. */
  compare: { version: number; built: boolean; src: string } | null;
};

function summary(t: Translate): Html {
  return html`<p class="compare-summary" role="status" aria-live="polite" data-changed="${t('studio.compare.changed')}" data-added="${t('studio.compare.added')}" data-removed="${t('studio.compare.removed')}" data-same="${t('studio.compare.same')}"></p>`;
}

function pane(t: Translate, version: number, box: Html): Html {
  const caption = t('studio.draft.versionCaption', { version });
  return html`<div class="pane">${box}<p class="caption">${caption}</p></div>`;
}

export function stage(input: StageInput): Html {
  const { t, compare } = input;
  if (!input.built) {
    return html`<p>${t('studio.page.notBuilt', { version: input.version, slug: input.slug })}</p>`;
  }
  const wide = html`<p class="caption">${t('studio.draft.wide', { width: input.width })}</p>`;
  const base = { t, host: input.host, width: input.width };
  if (!compare) {
    const title = t('studio.page.frame', { title: input.name });
    return html`${frameBox({ ...base, src: input.src, title, role: 'current' })}${wide}`;
  }
  const titleOf = (version: number): string =>
    `${t('studio.page.frame', { title: input.name })}, ${t('studio.draft.versionCaption', { version })}`;
  const before = compare.built
    ? frameBox({ ...base, src: compare.src, title: titleOf(compare.version), role: 'before' })
    : html`<p>${t('studio.page.notBuilt', { version: compare.version, slug: input.slug })}</p>`;
  const current = frameBox({
    ...base,
    src: input.src,
    title: titleOf(input.version),
    role: 'current',
  });
  const summed = compare.built ? summary(t) : '';
  return html`<div class="compare">${pane(t, compare.version, before)}${pane(t, input.version, current)}</div>${wide}${summed}`;
}
