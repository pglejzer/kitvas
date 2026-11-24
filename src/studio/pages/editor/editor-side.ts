// The editor screen's side panels (plan 15, C4): each a row of tabs over its panes, a fold button,
// and the rail it folds to; a grip on its inner edge. The editor's regions keep their
// `data-edit` names, so `client/studio/edit/` finds them anywhere in the screen; the screen's
// script (`client/studio/shell/`) runs the tabs, grips and rails. The page shows Preview's
// defaults until the script applies the viewer's own: the left panel folded, the right on Checks.

import type { Translate } from '../../../shared/index.ts';
import { type Html, html, trusted } from '../html.ts';

export type Side = 'left' | 'right';

export type SidesInput = {
  t: Translate;
  /** Why the version cannot be edited, said in the editor's panes; `null` when it can. */
  locked: string | null;
  /** The Checks pane's content: what the checks could not do, then the findings. */
  checks: Html;
  /** A craft draft's pick (`craftPick`); `null` for any other draft. */
  sketches: Html | null;
};

type Tab = { id: string; label: string };

const HIDDEN = trusted(' hidden');

/** The row of tabs, `selected` the one shown, and the button that folds the panel. */
function tabRow(t: Translate, side: Side, tabs: Tab[], selected: string): Html {
  const buttons = tabs.map((tab) => {
    const on = tab.id === selected;
    return html`<button type="button" class="editor-tab" role="tab" id="editor-tab-${tab.id}" data-tab="${tab.id}" aria-controls="editor-pane-${tab.id}" aria-selected="${on ? 'true' : 'false'}" tabindex="${on ? '0' : '-1'}">${tab.label}</button>`;
  });
  const fold = t(`studio.edit.shell.fold.${side}`);
  const arrow = side === 'left' ? '‹' : '›';
  return html`<div class="editor-tabs"><div class="editor-tablist" role="tablist" aria-label="${t(`studio.edit.shell.${side}`)}">${buttons}</div><button type="button" class="editor-fold" data-fold="${side}" aria-label="${fold}" title="${fold}">${arrow}</button></div>`;
}

/** One pane: `region` is its `data-edit` or `data-shell` name (C4). */
function pane(id: string, region: Html, shown: boolean, content: Html | string): Html {
  return html`<section class="editor-pane"${region} data-pane="${id}" id="editor-pane-${id}" role="tabpanel" aria-labelledby="editor-tab-${id}" tabindex="0"${shown ? '' : HIDDEN}>${content}</section>`;
}

/** The rail a folded panel becomes: its name on end, and a dot while something is selected. */
function rail(t: Translate, side: Side, name: string): Html {
  return html`<button type="button" class="editor-rail" data-rail="${side}" aria-label="${t('studio.edit.shell.open', { name })}"><span class="editor-rail-dot" aria-hidden="true"></span><span class="editor-rail-name">${name}</span></button>`;
}

/** What an editor pane holds on a version it cannot edit: the reason. */
function lockedNote(locked: string | null): Html | '' {
  return locked === null ? '' : html`<p class="editor-pane-note">${locked}</p>`;
}

/** Layers and Insert: the editor's tree and palette. */
export function leftSide(input: SidesInput): Html {
  const { t } = input;
  const tabs: Tab[] = [
    { id: 'layers', label: t('studio.edit.shell.tab.layers') },
    { id: 'insert', label: t('studio.edit.shell.tab.insert') },
    { id: 'why', label: t('studio.edit.shell.tab.why') },
  ];
  const note = lockedNote(input.locked);
  const layers = pane('layers', trusted(' data-edit="layers"'), true, note);
  const insert = pane('insert', trusted(' data-edit="palette"'), false, note);
  // Stage 4d (plan 17, task E): the reasons of each section.
  const why = pane('why', trusted(' data-edit="why"'), false, note);
  const name = t('studio.edit.shell.tab.layers');
  return html`<aside class="editor-side" data-side="left" id="editor-side-left" aria-label="${t('studio.edit.shell.left')}" data-folded>${tabRow(t, 'left', tabs, 'layers')}${layers}${insert}${why}${rail(t, 'left', name)}</aside>`;
}

/**
 * Properties, Changes, Checks and, on a craft draft, Sketches. The conflict note sits above the
 * panes, so it shows whichever tab is open. Properties says how to fill it while Edit is off.
 */
export function rightSide(input: SidesInput): Html {
  const { t } = input;
  const tabs: Tab[] = [
    { id: 'properties', label: t('studio.edit.shell.tab.properties') },
    { id: 'changes', label: t('studio.edit.shell.tab.changes') },
    { id: 'checks', label: t('studio.edit.shell.tab.checks') },
    { id: 'ai', label: t('studio.edit.shell.tab.ai') },
  ];
  if (input.sketches !== null) {
    tabs.push({ id: 'sketches', label: t('studio.edit.shell.tab.sketches') });
  }
  const note = lockedNote(input.locked);
  const region =
    input.locked === null
      ? html` data-edit="props" data-empty="${t('studio.edit.shell.propsOff')}"`
      : trusted(' data-edit="props"');
  const props = pane('properties', region, false, note);
  const changes = pane('changes', trusted(' data-edit="changes"'), false, note);
  const checks = pane('checks', trusted(' data-shell="checks"'), true, input.checks);
  // Stage 4d (plan 17, task B): requests to Claude and their variants.
  const ai = pane('ai', trusted(' data-edit="ai"'), false, note);
  const sketches =
    input.sketches === null
      ? ''
      : pane('sketches', trusted(' data-shell="sketches"'), false, input.sketches);
  const name = t('studio.edit.shell.tab.checks');
  return html`<aside class="editor-side" data-side="right" id="editor-side-right" aria-label="${t('studio.edit.shell.right')}">${tabRow(t, 'right', tabs, 'checks')}<div data-edit="conflict" hidden></div>${props}${changes}${checks}${ai}${sketches}${rail(t, 'right', name)}</aside>`;
}

/** The grip on a panel's inner edge; the script sets its values and moves it. */
export function grip(t: Translate, side: Side): Html {
  // The left panel starts folded, and a rail has nothing to resize.
  const folded = side === 'left' ? HIDDEN : '';
  return html`<div class="editor-grip" data-grip="${side}" role="separator" tabindex="0" aria-orientation="vertical" aria-controls="editor-side-${side}" aria-label="${t(`studio.edit.shell.grip.${side}`)}"${folded}></div>`;
}
