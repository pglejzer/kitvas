// The editor screen's sides (plan 15, C4; plan 18, task A, C8). On the left a rail of icons, one
// per pane of the left panel (Layers, Insert, Why, Notes), with the fold at its end; the panel
// shows one pane at a time. On the right a row of tabs over the right panel's panes, a fold
// button, and the rail the panel folds to. A grip on each panel's inner edge. Every pane host is a
// column that fills its panel and never scrolls itself; what it holds scrolls in one `.k-scroll`.
// The editor's regions keep their `data-edit` names, so `client/studio/edit/` finds them anywhere
// in the screen; the screen's script (`client/studio/shell/`) runs the rail, tabs, grips and
// folds. The page shows Preview's defaults until the script applies the viewer's own: the left
// panel folded, the right on Checks.

import type { Translate } from '../../../shared/index.ts';
import type { ChoiceLink } from '../draft/draft-links.ts';
import { type Html, html, trusted } from '../html.ts';
import { icon } from '../icons/icon.ts';
import type { IconName } from '../icons/paths.ts';
import { commandBox } from '../states/command.ts';
import type { EditBlock } from './editor-bar.ts';

export type Side = 'left' | 'right';

export type SidesInput = {
  t: Translate;
  /** What an editor pane holds on a version it cannot edit (`lockedNote`); `null` when it can. */
  locked: Html | null;
  /** The Checks pane's content: what the checks could not do, then the findings. */
  checks: Html;
  /** A craft draft's pick (`craftPick`); `null` for any other draft. */
  sketches: Html | null;
  /** Whether the Layers pane holds the Versions list: a built version, not compared. */
  timeline: boolean;
};

type Tab = { id: string; label: string };
type RailPane = Tab & { icon: IconName; region: Html };

const HIDDEN = trusted(' hidden');
/** The right tabs that show a count after their label (plan 18f). */
const COUNTED: ReadonlySet<string> = new Set(['changes', 'checks']);

export type LockedInput = {
  t: Translate;
  block: EditBlock;
  link: ChoiceLink;
  latest: number;
  slug: string;
};

/**
 * What an editor pane holds on a version it cannot edit: the reason in one sentence, and the one
 * step that leads to a version that can be edited (spec goal 6).
 */
export function lockedNote(input: LockedInput): Html {
  const { t, block, link } = input;
  const reason = t(`studio.edit.shell.reason.${block}`);
  const next =
    block === 'compare'
      ? html`<a class="k-btn k-btn-line" href="${link({}, null)}">${t('studio.draft.stopCompare')}</a>`
      : block === 'old'
        ? html`<a class="k-btn k-btn-line" href="${link({ version: input.latest }, null)}">${t('studio.edit.shell.toLatest')}</a>`
        : commandBox(t, `kitvas build ${input.slug}`, { copy: true });
  return html`<div class="k-empty pane-empty"><p>${reason}</p>${next}</div>`;
}

/** One pane host of the left panel, named by its rail button. */
function leftPane(pane: RailPane, shown: boolean, content: Html | string): Html {
  return html`<section class="pane-host k-rise"${pane.region} data-pane="${pane.id}" id="editor-pane-${pane.id}" aria-labelledby="editor-rail-${pane.id}" tabindex="-1"${shown ? '' : HIDDEN}>${content}</section>`;
}

/** One pane host of the right panel, a tab's panel; `region` is its `data-edit` or `data-shell` (C8). */
function rightPane(id: string, region: Html, shown: boolean, content: Html | string): Html {
  return html`<section class="pane-host k-rise"${region} data-pane="${id}" id="editor-pane-${id}" role="tabpanel" aria-labelledby="editor-tab-${id}" tabindex="0"${shown ? '' : HIDDEN}>${content}</section>`;
}

function railButton(pane: RailPane): Html {
  return html`<button type="button" class="k-icon-btn rail-btn" data-rail-tab="${pane.id}" id="editor-rail-${pane.id}" aria-controls="editor-pane-${pane.id}" aria-pressed="false" aria-label="${pane.label}" title="${pane.label}">${icon(pane.icon)}</button>`;
}

type LeftPanes = { layers: RailPane; insert: RailPane; why: RailPane; notes: RailPane };

/** The left panel's panes, in the rail's order (C8): the Layers host names no region itself. */
function leftPanes(t: Translate): LeftPanes {
  const pane = (id: string, glyph: IconName, region: string): RailPane => ({
    id,
    label: t(`studio.edit.shell.tab.${id}`),
    icon: glyph,
    region: trusted(region),
  });
  return {
    layers: pane('layers', 'layers', ''),
    insert: pane('insert', 'insert', ' data-edit="palette"'),
    // Stage 4d (plan 17, task E): the reasons of each section.
    why: pane('why', 'why', ' data-edit="why"'),
    notes: pane('notes', 'note', ' data-edit="notes"'),
  };
}

/**
 * The rail beside the left panel: a button per pane, the one shown in the open panel pressed, and
 * the fold at its end. The left panel starts folded, so none is pressed.
 */
export function rail(t: Translate): Html {
  const buttons = Object.values(leftPanes(t)).map(railButton);
  const name = t('studio.edit.shell.left');
  return html`<nav class="k-island rail-nav" aria-label="${t('studio.edit.shell.rail')}">${buttons}<span class="rail-grow" aria-hidden="true"></span><button type="button" class="k-icon-btn rail-btn rail-fold" data-fold="left" aria-controls="editor-side-left" aria-expanded="false" aria-label="${name}" title="${name}">${icon('panel')}</button></nav>`;
}

/**
 * Layers, Insert, Why and Notes. Layers holds the tree and, under it, the Versions list
 * (`[data-timeline]`, filled by `client/studio/edit/timeline/`); never while comparing, as
 * compare has a card per version already.
 */
export function leftSide(input: SidesInput): Html {
  const { t } = input;
  const note = input.locked ?? '';
  const { layers, insert, why, notes } = leftPanes(t);
  const versions = input.timeline
    ? html`<div class="pane-versions" data-timeline role="group" aria-label="${t('studio.edit.timeline.label')}" hidden></div>`
    : '';
  const tree = html`<div class="pane-tree" data-edit="layers">${note}</div>${versions}`;
  const panes = [
    leftPane(layers, true, tree),
    leftPane(insert, false, note),
    leftPane(why, false, note),
    leftPane(notes, false, ''),
  ];
  return html`<aside class="k-island side-panel" data-side="left" id="editor-side-left" aria-label="${t('studio.edit.shell.left')}" data-folded>${panes}</aside>`;
}

/** The right panel's tabs, `selected` the one shown, and the button that folds the panel. */
function tabRow(t: Translate, tabs: Tab[], selected: string): Html {
  const buttons = tabs.map((tab) => {
    const on = tab.id === selected;
    // Changes and Checks carry a count after the label (plan 18f): the span is drawn empty and the
    // client fills it (`client/studio/edit/history/tab-counts.ts`), so the tabs do not shift.
    const count = COUNTED.has(tab.id)
      ? html`<span class="k-count" data-tab-count="${tab.id}"></span>`
      : '';
    return html`<button type="button" class="k-tab" role="tab" id="editor-tab-${tab.id}" data-tab="${tab.id}" aria-controls="editor-pane-${tab.id}" aria-selected="${on ? 'true' : 'false'}" tabindex="${on ? '0' : '-1'}">${tab.label}${count}</button>`;
  });
  const fold = t('studio.edit.shell.fold.right');
  return html`<div class="side-head"><div class="k-tabs side-tabs" role="tablist" aria-label="${t('studio.edit.shell.right')}">${buttons}</div><button type="button" class="k-icon-btn side-fold" data-fold="right" aria-controls="editor-side-right" aria-label="${fold}" title="${fold}">${icon('panel')}</button></div>`;
}

/** The rail a folded right panel becomes: its tab's name on end, and a dot while something is selected. */
function sideRail(t: Translate, name: string): Html {
  return html`<button type="button" class="side-rail" data-rail="right" aria-label="${t('studio.edit.shell.open', { name })}">${icon('panel')}<span class="side-rail-dot" aria-hidden="true"></span><span class="side-rail-name">${name}</span></button>`;
}

/**
 * Properties, Changes, Checks, Claude and, on a craft draft, Sketches. The conflict note sits above
 * the panes, so it shows whichever tab is open. Properties says how to fill it while Edit is off.
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
  const note = input.locked ?? '';
  const region =
    input.locked === null
      ? html` data-edit="props" data-empty="${t('studio.edit.shell.propsOff')}"`
      : trusted(' data-edit="props"');
  const props = rightPane('properties', region, false, note);
  const changes = rightPane('changes', trusted(' data-edit="changes"'), false, note);
  const checks = rightPane('checks', trusted(' data-shell="checks"'), true, input.checks);
  // Stage 4d (plan 17, task B): requests to Claude and their variants.
  const ai = rightPane('ai', trusted(' data-edit="ai"'), false, note);
  const sketches =
    input.sketches === null
      ? ''
      : rightPane('sketches', trusted(' data-shell="sketches"'), false, input.sketches);
  const name = t('studio.edit.shell.tab.checks');
  return html`<aside class="k-island side-panel" data-side="right" id="editor-side-right" aria-label="${t('studio.edit.shell.right')}">${tabRow(t, tabs, 'checks')}<div data-edit="conflict" hidden></div>${props}${changes}${checks}${ai}${sketches}${sideRail(t, name)}</aside>`;
}

/** The grip on a panel's inner edge; the script sets its values and moves it. */
export function grip(t: Translate, side: Side): Html {
  // The left panel starts folded, and a folded panel has nothing to resize.
  const folded = side === 'left' ? HIDDEN : '';
  return html`<div class="side-grip" data-grip="${side}" role="separator" tabindex="0" aria-orientation="vertical" aria-controls="editor-side-${side}" aria-label="${t(`studio.edit.shell.grip.${side}`)}"${folded}></div>`;
}
