// The Layout group (plan 18f, task 2; spec S4.6 item 4): Direction as arrows, Align as an icon
// group, Justify too (space between has its icon), Wrap as a switch and Gap as a field with its token, for what the
// element lays out (`layout-model.ts`); under them "All layout properties" folded, the raw CSS
// rows as before. A human row is a second view of its property: it writes the same edit.

import type { StyleProperty } from '../../../../../src/edit/index.ts';
import { sharedText } from '../../style/ops.ts';
import { text } from '../../texts.ts';
import { type FoldId, isFolded, STYLE_GROUPS, subFoldView } from './groups.ts';
import { type HumanRow, humanRows, layoutKind } from './layout-model.ts';
import type { Env } from './rows.ts';
import { type RowLook, styleRow } from './style.ts';

/** The display the rows go by: the frame's for one element, else the one every element holds. */
function displayOf(env: Env): string | null {
  if (env.views.length === 1) return env.state.computed?.display ?? null;
  const shared = sharedText(env.views, 'display');
  return shared === 'mixed' ? null : shared.text;
}

function lookOf(row: HumanRow): RowLook {
  const look: RowLook = {
    key: `layout:${row.id}`,
    label: text(`props.layout.${row.id}`),
  };
  if (row.keywords !== null) look.keywords = row.keywords;
  if (row.look === 'icons' || row.look === 'words') look.words = true;
  if (row.look === 'switch') look.toggle = { on: 'wrap', off: 'nowrap' };
  return look;
}

export function layoutRows(
  env: Env,
  shared: ReadonlySet<StyleProperty>,
  folds: { folds: ReadonlySet<FoldId>; toggle(id: FoldId): void },
): HTMLElement[] {
  const rows: HTMLElement[] = [];
  for (const row of humanRows(layoutKind(displayOf(env)))) {
    if (shared.has(row.property)) rows.push(styleRow(env, row.property, lookOf(row)));
  }
  const raw = STYLE_GROUPS.layout
    .filter((property) => shared.has(property))
    .map((property) => styleRow(env, property));
  if (raw.length > 0) {
    rows.push(
      subFoldView({
        id: 'layout-all',
        title: text('props.layout.all'),
        folded: isFolded(folds.folds, 'layout-all'),
        rows: raw,
        onToggle: () => folds.toggle('layout-all'),
      }),
    );
  }
  return rows;
}
