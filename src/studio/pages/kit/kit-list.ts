// The kits as the pages list them: the grid of `/kit` and the picker on the left of a kit's page.

import { type KitSource, type KitStore, loadKit } from '../../../kit/index.ts';
import { KitvasError, type Translate } from '../../../shared/index.ts';
import { sourceLine } from '../../views/kit-status.ts';
import { type Html, html } from '../html.ts';

export type Entry =
  | {
      id: string;
      kind: 'kit';
      name: string;
      version: string;
      source: KitSource;
      components: number;
      problems: number;
    }
  | { id: string; kind: 'unreadable' };

export function entries(kits: KitStore): Entry[] {
  return kits.list().map((id): Entry => {
    try {
      const { kit, issues } = loadKit(kits, id);
      return {
        id,
        kind: 'kit',
        name: kit.name,
        version: kit.version,
        source: kit.source,
        components: kit.components.length,
        problems: issues.length,
      };
    } catch (error) {
      if (!(error instanceof KitvasError)) throw error;
      return { id, kind: 'unreadable' };
    }
  });
}

/** The words and the dot of a kit's state; `null` for a kit that cannot be read. */
function stateOf(t: Translate, entry: Entry): { dot: 'good' | 'fix'; words: string } | null {
  if (entry.kind === 'unreadable') return null;
  if (entry.problems === 0) return { dot: 'good', words: t('studio.kit.valid') };
  return { dot: 'fix', words: t('studio.kit.problems', { count: entry.problems }) };
}

function tile(t: Translate, entry: Entry, projectKit: string): Html {
  if (entry.kind === 'unreadable') {
    return html`<li class="kit-tile"><a class="kit-tile-name" href="/kit/${entry.id}">${entry.id}</a><span class="k-quiet">${t('studio.kit.unreadable')}</span></li>`;
  }
  const state = stateOf(t, entry);
  const summary = t('studio.kit.summary', { version: entry.version, count: entry.components });
  const line = sourceLine(entry.source);
  const mark =
    state === null
      ? ''
      : html`<span class="kit-state"><span class="k-dot" data-state="${state.dot}"></span><span class="${state.dot === 'fix' ? 'k-fix' : 'k-quiet'}">${state.words}</span></span>`;
  const used =
    entry.id === projectKit
      ? html`<span class="k-chip" data-tone="accent">${t('studio.kit.usedBy')}</span>`
      : '';
  return html`<li class="kit-tile"><span class="kit-tile-head"><a class="kit-tile-name" href="/kit/${entry.id}">${entry.name}</a>${used}</span><code>${entry.id}</code><span class="k-meta">${summary}</span><span class="k-meta kit-tile-source">${t(line.key, line.params)}</span>${mark}</li>`;
}

/** `/kit`: one card per kit; `projectKit` is the id of the one the project uses. */
export function kitTiles(t: Translate, rows: Entry[], projectKit: string): Html {
  return html`<ul class="kit-tiles" role="list">${rows.map((entry) => tile(t, entry, projectKit))}</ul>`;
}

function pick(t: Translate, entry: Entry, current: string): Html {
  if (entry.kind === 'unreadable') {
    return html`<li class="kit-pick kit-pick-off"><span class="k-clip">${entry.id}</span><span class="k-meta">${t('studio.kit.unreadable')}</span></li>`;
  }
  const state = stateOf(t, entry);
  const here = entry.id === current ? html` aria-current="page"` : '';
  const dot =
    state === null
      ? ''
      : html`<span class="k-dot" data-state="${state.dot}"></span><span class="k-sr">${state.words}</span>`;
  const summary = t('studio.kit.summary', { version: entry.version, count: entry.components });
  return html`<li><a class="kit-pick" href="/kit/${entry.id}"${here}><span class="kit-pick-text"><span class="k-clip">${entry.name}</span><span class="k-meta k-clip">${summary}</span></span>${dot}</a></li>`;
}

/** The kits on the left of a kit's page; `current` is the one shown. */
export function kitPicker(t: Translate, rows: Entry[], current: string): Html {
  return html`<nav aria-label="${t('studio.kit.title')}"><h2 class="kit-side-title">${t('studio.kit.title')}</h2><ul class="kit-picks" role="list">${rows.map((entry) => pick(t, entry, current))}</ul></nav>`;
}
