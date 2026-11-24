// The editor screen's top bar (plan 15, C4), in three parts: the kitvas mark, the draft's title
// and the version and compare menus; the Preview | Edit switch; and, on a version that can be
// edited, the session's controls (`client/studio/edit/history/session.ts` runs them). The menus are plain
// links in `<details>`, so they work without the script.

import type { Draft } from '../../../drafts/index.ts';
import type { Translate } from '../../../shared/index.ts';
import type { DraftChoice } from '../../views/draft-query.ts';
import type { ChoiceLink } from '../draft/draft-links.ts';
import { type Html, html, trusted } from '../html.ts';

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
};

type PickItem = { label: string; tag: string | null; href: string; current: boolean };

const CURRENT = trusted(' aria-current="true"');
const COMPARE_ICON = trusted('<span class="editor-pick-icon" aria-hidden="true">⇄</span>');

function pickItem(item: PickItem): Html {
  const tag = item.tag === null ? '' : html`<small class="editor-pick-tag">${item.tag}</small>`;
  return html`<li><a class="editor-pick-item" href="${item.href}"${item.current ? CURRENT : ''}><span>${item.label}</span>${tag}</a></li>`;
}

/** A menu of links; `region` names it for the script and the tests (C4). */
function pickMenu(region: string, name: string, summary: Html | string, items: Html[]): Html {
  return html`<details class="editor-pick" data-shell="${region}"><summary>${summary}</summary><ul class="editor-pick-list" role="list" aria-label="${name}">${items}</ul></details>`;
}

/** Every version, newest first, the one shown marked; the latest says so. */
function versionMenu(input: BarInput): Html {
  const { t, draft, choice, link } = input;
  const items = [...draft.versions]
    .sort((a, b) => b.number - a.number)
    .map((entry) =>
      pickItem({
        label: t('studio.draft.versionCaption', { version: entry.number }),
        tag: entry.number === input.latest ? t('studio.edit.shell.latest') : null,
        href: link({ version: entry.number }),
        current: entry.number === choice.version,
      }),
    );
  const summary = t('studio.draft.versionCaption', { version: choice.version });
  return pickMenu('version', t('studio.edit.shell.versions'), summary, items);
}

function compareSummary(t: Translate, compare: number | undefined): Html {
  if (compare === undefined) return html`${COMPARE_ICON}${t('studio.edit.shell.compare')}`;
  const label =
    compare === 0
      ? t('studio.edit.shell.comparingOriginal')
      : t('studio.edit.shell.comparing', { version: compare });
  return html`${COMPARE_ICON}${label}`;
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

/**
 * The other versions, the original of a rework (version 0), and "Stop comparing" while comparing.
 * With nothing to compare it keeps its place in the bar, off, and says why.
 */
function compareMenu(input: BarInput): Html {
  const { t, choice, link } = input;
  const items = compareItems(input);
  if (items.length === 0 && choice.compare === undefined) {
    return html`<button type="button" class="editor-pick-off" data-shell="compare" disabled title="${t('studio.edit.shell.compareNone')}">${COMPARE_ICON}${t('studio.edit.shell.compare')}</button>`;
  }
  const stop =
    choice.compare === undefined
      ? []
      : [
          html`<li class="editor-pick-stop"><a class="editor-pick-item" href="${link({}, null)}"><span>${t('studio.draft.stopCompare')}</span></a></li>`,
        ];
  return pickMenu(
    'compare',
    t('studio.edit.shell.compareList'),
    compareSummary(t, choice.compare),
    [...items.map(pickItem), ...stop],
  );
}

/** Preview and Edit; Edit is off, with the reason as its tooltip, on a version it cannot edit. */
function modeSwitch(input: BarInput): Html {
  const { t, block } = input;
  const off =
    block === null ? '' : html` disabled title="${t(`studio.edit.shell.reason.${block}`)}"`;
  return html`<div class="editor-modes" role="group" aria-label="${t('studio.edit.shell.mode')}"><button type="button" class="editor-mode" data-shell-mode="preview" aria-pressed="true">${t('studio.edit.shell.preview')}</button><button type="button" class="editor-mode" data-shell-mode="edit" aria-pressed="false"${off}>${t('studio.edit.shell.edit')}</button></div>`;
}

/** The session's controls on a version that can be edited; the shortcuts on every version. */
function barEnd(input: BarInput): Html {
  const { t } = input;
  const name = t('studio.edit.shell.shortcuts');
  const help = html`<button type="button" class="editor-help" data-shell="shortcuts" aria-label="${name}" title="${name}">?</button>`;
  if (input.block !== null) return html`<div class="editor-bar-end">${help}</div>`;
  return html`<div class="editor-bar-end"><button type="button" class="editor-act" data-edit-undo disabled>${t('studio.edit.shell.undo')}</button><button type="button" class="editor-act" data-edit-redo disabled>${t('studio.edit.shell.redo')}</button><span class="editor-session" data-edit-session role="status"></span><button type="button" class="editor-act editor-save" data-edit-save disabled>${t('studio.edit.save')}</button><button type="button" class="editor-act" data-edit-unsave hidden>${t('studio.edit.shell.unsave')}</button>${help}</div>`;
}

export function editorBar(input: BarInput): Html {
  const { t, draft } = input;
  const start = html`<div class="editor-bar-start"><a class="mark" href="/" title="${t('studio.nav.drafts')}">kitvas</a><h1 class="editor-title">${draft.title}</h1>${versionMenu(input)}${compareMenu(input)}</div>`;
  return html`<header class="editor-bar">${start}${modeSwitch(input)}${barEnd(input)}</header>`;
}
