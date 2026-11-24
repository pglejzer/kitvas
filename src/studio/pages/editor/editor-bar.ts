// The editor screen's top bar (plan 15, C4; plan 18, task A), the shared `.k-bar` in three parts:
// the kitvas mark, "Drafts / title" and the version menu; Preview | Edit; and the end. On a version
// that can be edited the end holds the listening status, the session line, undo and redo (in
// Edit) or the findings, the notes and Compare (in Preview), View, More and Save version
// (`client/studio/edit/history/session.ts` runs the session's controls). On any other version it
// holds the findings, Compare, View and More. The menus are plain links in `<details>`, so they
// work without the script; More holds Compare and the list of shortcuts, which `?` opens too.

import type { Draft } from '../../../drafts/index.ts';
import type { Translate } from '../../../shared/index.ts';
import type { DraftChoice } from '../../views/draft-query.ts';
import { type DraftStatus, statusLine } from '../../views/status.ts';
import type { ChoiceLink } from '../draft/draft-links.ts';
import { type Html, html, trusted } from '../html.ts';
import { icon } from '../icons/icon.ts';
import { viewButton } from '../view-settings.ts';

/** Why Edit is off for the version shown: comparing, an older version, or one not built. */
export type EditBlock = 'compare' | 'old' | 'unbuilt';

export type EditView = {
  built: boolean;
  version: number;
  latest: number;
  /** The compared version, `0` for a rework's original; `null` without compare. */
  compare: number | null;
};

/** Only the latest built version, outside compare, can be edited; `null` when this one can. */
export function editBlock(view: EditView): EditBlock | null {
  if (view.compare !== null) return 'compare';
  if (view.version !== view.latest) return 'old';
  if (!view.built) return 'unbuilt';
  return null;
}

export type BarInput = {
  t: Translate;
  draft: Draft;
  choice: DraftChoice;
  link: ChoiceLink;
  latest: number;
  block: EditBlock | null;
  /** What the checks found at the state and width shown: the bar's findings count. */
  status: DraftStatus;
};

type PickItem = { label: string; tag: string | null; href: string; current: boolean };

const CURRENT = trusted(' aria-current="true"');

/** A link of a menu; the one shown is marked, with a tick at its end. */
function pickLink(item: PickItem): Html {
  const tag = item.tag === null ? '' : html`<span class="k-meta">${item.tag}</span>`;
  const tick = item.current ? html`<span class="bar-tick">${icon('check')}</span>` : '';
  return html`<a class="k-menu-item" href="${item.href}"${item.current ? CURRENT : ''}><span>${item.label}</span>${tag}${tick}</a>`;
}

/** A menu of links; `region` names it for the script and the tests (C4). */
function pickMenu(region: string, name: string, summary: Html, items: Html[], end: boolean): Html {
  const list = end ? 'k-pop k-menu bar-list bar-list-end' : 'k-pop k-menu bar-list';
  const entries = items.map((item) => html`<li>${item}</li>`);
  return html`<details class="bar-menu" data-shell="${region}"><summary class="k-btn">${summary}${icon('chevron-down')}</summary><ul class="${list}" role="list" aria-label="${name}">${entries}</ul></details>`;
}

/** Every version, newest first, the one shown marked; the latest says so. */
function versionMenu(input: BarInput): Html {
  const { t, draft, choice, link } = input;
  const latest = t('studio.edit.shell.latest');
  const items = [...draft.versions]
    .sort((a, b) => b.number - a.number)
    .map((entry) =>
      pickLink({
        label: t('studio.draft.versionCaption', { version: entry.number }),
        tag: entry.number === input.latest ? latest : null,
        href: link({ version: entry.number }),
        current: entry.number === choice.version,
      }),
    );
  const tag = choice.version === input.latest ? html`<span class="k-meta">${latest}</span>` : '';
  const summary = html`${t('studio.draft.versionCaption', { version: choice.version })}${tag}`;
  return pickMenu('version', t('studio.edit.shell.versions'), summary, items, false);
}

function compareSummary(t: Translate, compare: number | undefined): Html {
  if (compare === undefined) return html`${icon('compare')}${t('studio.edit.shell.compare')}`;
  const label =
    compare === 0
      ? t('studio.edit.shell.comparingOriginal')
      : t('studio.edit.shell.comparing', { version: compare });
  return html`${icon('compare')}${label}`;
}

/** What compare can show: the other versions, newest first, then a rework's original. */
function compareItems(input: BarInput): PickItem[] {
  const { t, draft, choice, link } = input;
  const items: PickItem[] = draft.versions
    .map((entry) => entry.number)
    .filter((number) => number !== choice.version)
    .sort((a, b) => b - a)
    .map((number) => ({
      label: t('studio.draft.versionCaption', { version: number }),
      tag: null,
      href: link({}, number),
      current: choice.compare === number,
    }));
  if (draft.kind === 'rework') {
    const label = t('studio.draft.original');
    items.push({ label, tag: null, href: link({}, 0), current: choice.compare === 0 });
  }
  return items;
}

/** The compare links and, while comparing, "Stop comparing"; none when there is nothing to show. */
function compareLinks(input: BarInput): Html[] {
  const { t, choice, link } = input;
  const items = compareItems(input).map(pickLink);
  if (choice.compare === undefined) return items;
  const stop = html`<a class="k-menu-item" href="${link({}, null)}"><span>${t('studio.draft.stopCompare')}</span></a>`;
  return [...items, stop];
}

/**
 * The other versions, the original of a rework (version 0), and "Stop comparing" while comparing.
 * With nothing to compare it keeps its place in the bar, off, and says why.
 */
function compareMenu(input: BarInput): Html {
  const { t, choice } = input;
  const links = compareLinks(input);
  if (links.length === 0) {
    return html`<button type="button" class="k-btn" data-shell="compare" disabled title="${t('studio.edit.shell.compareNone')}">${icon('compare')}${t('studio.edit.shell.compare')}</button>`;
  }
  const name = t('studio.edit.shell.compareList');
  return pickMenu('compare', name, compareSummary(t, choice.compare), links, true);
}

/** More: Compare (the same links as the bar's menu, which Edit hides) and the shortcuts. */
function moreMenu(input: BarInput): Html {
  const { t } = input;
  const links = compareLinks(input);
  const compare =
    links.length === 0
      ? html`<p class="k-meta bar-list-head">${t('studio.edit.shell.compareNone')}</p>`
      : html`<p class="k-meta bar-list-head">${t('studio.edit.shell.compareList')}</p>${links}`;
  const shortcuts = html`<button type="button" class="k-menu-item" data-shell="shortcuts">${t('studio.edit.shell.shortcuts')}<kbd class="k-kbd">?</kbd></button>`;
  const name = t('studio.edit.shell.more');
  return html`<details class="bar-menu"><summary class="k-icon-btn" aria-label="${name}" title="${name}">${icon('more')}</summary><div class="k-pop k-menu bar-list bar-list-end" data-shell="more">${compare}<div class="k-menu-sep"></div>${shortcuts}</div></details>`;
}

/** Preview and Edit; Edit is off, with the reason as its tooltip, on a version it cannot edit. */
function modeSwitch(input: BarInput): Html {
  const { t, block } = input;
  const off =
    block === null ? '' : html` disabled title="${t(`studio.edit.shell.reason.${block}`)}"`;
  return html`<div class="k-seg bar-modes" role="group" aria-label="${t('studio.edit.shell.mode')}"><button type="button" data-shell-mode="preview" aria-pressed="true">${t('studio.edit.shell.preview')}</button><button type="button" data-shell-mode="edit" aria-pressed="false"${off}>${t('studio.edit.shell.edit')}</button></div>`;
}

/** The state dot of the findings: a tone when there is one to say, green when all is good. */
function findingsDot(status: DraftStatus): 'fix' | 'review' | 'good' | null {
  if (status.kind !== 'checked') return null;
  if (status.fix > 0) return 'fix';
  if (status.review > 0) return 'review';
  return 'good';
}

/** What the checks found, as the Checks pane shows it; a click opens that pane (C8). */
function findingsButton(input: BarInput): Html {
  const { t, status } = input;
  const line = statusLine(status);
  const tone = findingsDot(status);
  const dot =
    tone === null
      ? html`<span class="k-dot" aria-hidden="true"></span>`
      : html`<span class="k-dot" data-state="${tone}" aria-hidden="true"></span>`;
  const open = t('studio.edit.shell.open', { name: t('studio.edit.shell.tab.checks') });
  return html`<button type="button" class="k-btn" data-bar-findings data-open-pane="checks" title="${open}">${dot}<span>${t(line.key, line.params)}</span></button>`;
}

/** The open notes; hidden until the notes say how many there are (C8, task B). */
function notesButton(t: Translate): Html {
  const name = t('studio.edit.notes.title');
  const open = t('studio.edit.shell.open', { name });
  return html`<button type="button" class="k-btn" data-bar-notes data-open-pane="notes" title="${open}" hidden>${name}<span class="k-count" data-count></span></button>`;
}

function barEnd(input: BarInput): Html {
  const { t } = input;
  const findings = findingsButton(input);
  const compare = compareMenu(input);
  const tail = html`<span class="k-sep bar-sep" aria-hidden="true"></span>${viewButton(t)}${moreMenu(input)}`;
  if (input.block !== null) return html`<div class="k-bar-end">${findings}${compare}${tail}</div>`;
  const undo = t('studio.edit.shell.undo');
  const redo = t('studio.edit.shell.redo');
  const edit = html`<span class="bar-group bar-in-edit"><button type="button" class="k-icon-btn" data-edit-undo disabled aria-label="${undo}" title="${undo}">${icon('undo')}</button><button type="button" class="k-icon-btn" data-edit-redo disabled aria-label="${redo}" title="${redo}">${icon('redo')}</button></span>`;
  const preview = html`<span class="bar-group bar-in-preview">${findings}${notesButton(t)}${compare}</span>`;
  const session = html`<span class="bar-listen" data-edit-listening></span><span class="bar-session k-clip" data-edit-session role="status"></span>`;
  const save = html`<button type="button" class="k-btn" data-edit-unsave hidden>${t('studio.edit.shell.unsave')}</button><button type="button" class="k-btn k-btn-primary bar-save" data-edit-save disabled>${t('studio.edit.save')}</button>`;
  return html`<div class="k-bar-end">${session}${edit}${preview}${tail}${save}</div>`;
}

export function editorBar(input: BarInput): Html {
  const { t, draft } = input;
  const start = html`<div class="k-bar-start"><span class="k-mark">kitvas</span><a class="k-btn bar-crumb" href="/">${t('studio.nav.drafts')}</a><span class="bar-slash" aria-hidden="true">/</span><h1 class="bar-title k-clip" title="${draft.title}">${draft.title}</h1>${versionMenu(input)}</div>`;
  return html`<header class="k-bar bar-editor">${start}<div class="k-bar-mid">${modeSwitch(input)}</div>${barEnd(input)}</header>`;
}
