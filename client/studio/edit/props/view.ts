// What the properties panel shows for its selection (plan 15, task C; spec goal 8): the header,
// the edit context's bar (stage 4c: the width edits go to and the state bar), the notes, then the
// groups in their fixed order. One element shows every row; several show the rows they share, and
// a group without one is left out. The box model holds Spacing's sides.

import type { StyleProperty } from '../../../../src/edit/index.ts';
import { sharedProperties } from '../style/ops.ts';
import { text } from '../texts.ts';
import {
  type BoxLayer,
  type BoxLink,
  type BoxSide,
  type BoxState,
  boxProperty,
  boxView,
} from './box.ts';
import { contextBarView } from './context-bar.ts';
import { el } from './controls.ts';
import { GROUPS, type GroupId, groupView, STYLE_GROUPS, type StyleGroup } from './groups.ts';
import { headerView } from './header.ts';
import { type Env, propRows, textRow } from './rows.ts';
import { styleRow } from './style.ts';
import { suggestActions } from './suggest.ts';

/** The panel's own state the view reads and changes: the folds and the box. */
export type PanelUi = {
  folds: ReadonlySet<GroupId>;
  box: BoxState;
  toggle(id: GroupId): void;
  pickSide(layer: BoxLayer, side: BoxSide): void;
  link(link: BoxLink): void;
};

/** The box's rows: the box itself, the row of the side it edits now, and gap. */
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
  else rows.push(el('p', 'props-note', text('props.many.notShared')));
  if (shared.has('gap')) rows.push(styleRow(env, 'gap'));
  return rows;
}

function groupTitle(env: Env, id: GroupId): string {
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
  return STYLE_GROUPS[id]
    .filter((property) => shared.has(property))
    .map((property) => styleRow(env, property));
}

/** The notes about the element that hold for every row. */
function notes(env: Env): HTMLElement[] {
  const out: HTMLElement[] = [];
  const note = (key: string): void => {
    out.push(el('p', 'props-note', text(key)));
  };
  const { inspected, state } = env;
  if ((state.tree.find((node) => node.id === inspected.id)?.count ?? 1) > 1) note('props.mapped');
  // Stage 4c writes utility classes: the note says how, no longer that styles are read-only.
  if (env.format === 'tailwind') note('props.tailwindWrites');
  if (env.views.some((view) => view.spread)) note('props.spread');
  return out;
}

export function propsView(env: Env, ui: PanelUi): HTMLElement[] {
  const single = env.views.length === 1;
  const out: HTMLElement[] = [
    headerView({
      state: env.state,
      inspected: env.inspected,
      count: env.views.length,
      select: (id) => env.select(id),
      suggest: suggestActions(env),
    }),
    contextBarView({ context: env.state.context, pick: (state) => env.pickState(state) }),
    ...notes(env),
  ];
  // One element: every row, read-only ones with their reason. Several: the rows they share.
  const all = Object.values(STYLE_GROUPS).flat();
  const shared = new Set(single ? all : sharedProperties(env.views, all, env.format));
  for (const id of GROUPS) {
    let rows: HTMLElement[];
    if (id === 'component') rows = propRows(env);
    else if (id === 'text') {
      const row = textRow(env);
      rows = row === null ? [] : [row];
    } else rows = styleRows(env, ui, id, shared);
    if (rows.length === 0) continue;
    out.push(
      groupView({
        id,
        title: groupTitle(env, id),
        folded: ui.folds.has(id),
        rows,
        onToggle: () => ui.toggle(id),
      }),
    );
  }
  return out;
}
