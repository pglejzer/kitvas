// What the properties panel shows for its selection (plan 15, task C; spec goal 8; plan 18f, task
// 2 as mock v10 draws it, spec S4.6). The head stays in view: the crumbs and the element (its kit
// icon, name, chip and the move arrows), the scope row (the width chip and the states), and "All
// N items | This item" for a list item. Under it scroll the suggestion, the notes, then the groups
// in their fixed order: the component's props, Text, Layout, Radius, Spacing, Size, Typography,
// Background, Border, and Accessibility folded at the bottom. The Source strip is the foot. One
// element shows every row; several show the rows they share, and a group without one is left out.

import type { StyleProperty } from '../../../../../src/edit/index.ts';
import { partTarget } from '../../structure/list-parts.ts';
import { sharedProperties } from '../../style/ops.ts';
import { text } from '../../texts.ts';
import { contextBarView, scopeBarView } from '../context/context-bar.ts';
import { el } from '../controls/controls.ts';
import { a11yParts, type FindingOf } from '../groups/a11y-group.ts';
import {
  type BoxLayer,
  type BoxLink,
  type BoxSide,
  type BoxState,
  boxProperty,
} from '../groups/box.ts';
import { boxView } from '../groups/box-model.ts';
import {
  type FoldId,
  GROUPS,
  type GroupId,
  groupView,
  isFolded,
  STYLE_GROUPS,
  type StyleGroup,
} from '../groups/groups.ts';
import { layoutRows } from '../groups/layout-rows.ts';
import { type Env, propRows, textRow } from '../groups/rows.ts';
import { styleRow } from '../groups/style.ts';
import { headerView } from './header.ts';
import { sourceStrip } from './source-strip.ts';
import { suggestActions, suggestView } from './suggest.ts';

/** The panel's own state the view reads and changes: the folds and the box. */
export type PanelUi = {
  folds: ReadonlySet<FoldId>;
  box: BoxState;
  toggle(id: FoldId): void;
  pickSide(layer: BoxLayer, side: BoxSide): void;
  link(link: BoxLink): void;
  /** The list scope switch (ADR 0072): whether one copy is picked, and how to change the mode. */
  scope: { chosen: boolean; pick(mode: 'all' | 'item'): void };
  /** The live finding of a rule on the selected element, for Accessibility's links. */
  finding: FindingOf;
};

/**
 * The panel's parts: `head` stays in view; under it scroll the suggestion (`offer`), the `notes`
 * that hold for every row, and the `groups`; `foot` is the Source strip, in view at the bottom.
 */
export type PropsView = {
  head: HTMLElement[];
  offer: HTMLElement | null;
  notes: HTMLElement[];
  groups: HTMLElement[];
  foot: HTMLElement[];
};

/** The box's rows: the box itself, and the row of the side it edits now. */
function spacingRows(env: Env, ui: PanelUi, shared: ReadonlySet<StyleProperty>): HTMLElement[] {
  const rows: HTMLElement[] = [];
  const single = env.views.length === 1;
  rows.push(
    boxView({
      state: ui.box,
      computed: single ? env.state.computed : null,
      onPick: (layer, side) => ui.pickSide(layer, side),
      onLink: (link) => ui.link(link),
    }),
  );
  const editing = boxProperty(ui.box);
  if (shared.has(editing)) rows.push(styleRow(env, editing));
  else rows.push(el('p', 'props-hint', text('props.many.notShared')));
  return rows;
}

function groupTitle(env: Env, id: GroupId): string {
  if (id === 'a11y') return text('a11y.title');
  if (id !== 'component') return text(`props.group.${id}`);
  const component = env.inspected.component;
  return component
    ? text('props.group.component', { name: component.name })
    : text('props.group.element');
}

function styleRows(
  env: Env,
  ui: PanelUi,
  id: StyleGroup,
  shared: ReadonlySet<StyleProperty>,
): HTMLElement[] {
  if (id === 'spacing') {
    const any = STYLE_GROUPS.spacing.some((property) => shared.has(property));
    return any ? spacingRows(env, ui, shared) : [];
  }
  if (id === 'layout') return layoutRows(env, shared, ui);
  const present = STYLE_GROUPS[id].filter((property) => shared.has(property));
  // Radius is the group's one property: its control takes the row, as the header names it.
  if (id === 'radius') {
    return present.map((property) =>
      styleRow(env, property, { bare: true, label: text('props.group.radius') }),
    );
  }
  return present.map((property) => styleRow(env, property));
}

/** The notes about the element that hold for every row, and stay in view: a list's scope. */
function notes(env: Env): HTMLElement[] {
  const { inspected, state } = env;
  // With the "All N items | This item" switch the head already says it, and for a part of an item
  // the list's note above the pane does ("Part of a list item…").
  const mapped = (state.tree.find((node) => node.id === inspected.id)?.count ?? 1) > 1;
  const said = env.scope !== null || partTarget(state) !== null;
  return mapped && !said ? [el('p', 'props-hint', text('props.mapped'))] : [];
}

/** What explains the whole element, behind the header's info mark (spec S4.6 "Less text"). */
function explanations(env: Env): string[] {
  const out: string[] = [];
  // Stage 4c writes utility classes: the note says how, no longer that styles are read-only.
  if (env.format === 'tailwind') out.push(text('props.tailwindWrites'));
  if (env.views.some((view) => view.spread)) out.push(text('props.spread'));
  return out;
}

/** The Accessibility group, from the frame's card of one element; nothing without a card. */
function a11yGroup(env: Env, ui: PanelUi): HTMLElement | null {
  const card = env.state.a11y;
  if (card === null || env.views.length !== 1) return null;
  const parts = a11yParts(card, ui.finding);
  return groupView({
    id: 'a11y',
    title: groupTitle(env, 'a11y'),
    folded: isFolded(ui.folds, 'a11y'),
    rows: parts.rows,
    onToggle: () => ui.toggle('a11y'),
    chip: parts.chip,
  });
}

function rowsOf(
  env: Env,
  ui: PanelUi,
  id: Exclude<GroupId, 'a11y'>,
  shared: ReadonlySet<StyleProperty>,
): HTMLElement[] {
  if (id === 'component') return propRows(env);
  if (id === 'text') {
    const row = textRow(env);
    return row === null ? [] : [row];
  }
  return styleRows(env, ui, id, shared);
}

/** The Source strip of one element; none for several. */
const footOf = (env: Env): HTMLElement[] =>
  env.views.length === 1 ? [sourceStrip(env.inspected)] : [];

export function propsView(env: Env, ui: PanelUi): PropsView {
  const single = env.views.length === 1;
  const head = [
    headerView({
      state: env.state,
      inspected: env.inspected,
      count: env.views.length,
      select: (id) => env.select(id),
      notes: explanations(env),
    }),
    contextBarView({ context: env.state.context, pick: (state) => env.pickState(state) }),
  ];
  if (env.scope !== null) {
    head.push(scopeBarView({ ...env.scope, chosen: ui.scope.chosen, pick: ui.scope.pick }));
  }
  // Spec 4d, goal 6: a plain element a kit component covers; one element only.
  const offer = single ? suggestView(env.inspected, suggestActions(env)) : null;
  const groups: HTMLElement[] = [];
  // One element: every row, read-only ones with their reason. Several: the rows they share.
  const all = Object.values(STYLE_GROUPS).flat();
  const shared = new Set(single ? all : sharedProperties(env.views, all, env.format));
  for (const id of GROUPS) {
    if (id === 'a11y') {
      const group = a11yGroup(env, ui);
      if (group !== null) groups.push(group);
      continue;
    }
    const rows = rowsOf(env, ui, id, shared);
    if (rows.length === 0) continue;
    groups.push(
      groupView({
        id,
        title: groupTitle(env, id),
        folded: isFolded(ui.folds, id),
        rows,
        onToggle: () => ui.toggle(id),
      }),
    );
  }
  return { head, offer, notes: notes(env), groups, foot: footOf(env) };
}
