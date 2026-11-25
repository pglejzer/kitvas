// The panel's list scope (ADR 0072): "All N items | This item". Pure helpers over plain data: which
// copy "This item" is for, and what an item-scope answer says. The panel keeps the mode.

import type { Refusal } from '../../../../src/edit/index.ts';
import type { Inspect } from '../../../../src/studio/api/edit/edit-schemas.ts';
import { chosenCopy } from '../select/copies.ts';
import type { EditorState } from '../store.ts';
import type { Format } from '../style/ops.ts';
import { scopeOf } from './context-bar.ts';

export type ScopeMode = 'all' | 'item';

/** The one chosen copy of the one selected element: its place in each list, and its copy number. */
export type ItemTarget = { path: number[]; item: number };

/**
 * The copy "This item" is for: the chosen copy's `path`, else its place `[item]`. `null` when no
 * one copy is picked (several elements, or a click that named no copy).
 */
export function itemTargetOf(state: Pick<EditorState, 'selection' | 'copies'>): ItemTarget | null {
  const copy = chosenCopy(state.selection, state.copies);
  if (copy === null || copy.item === undefined) return null;
  return { path: copy.path ?? [copy.item], item: copy.item };
}

/** Why the server gave the item no class of its own; `null` when it did (or was not asked). */
export function refusedScope(view: Inspect): Refusal | null {
  const scope = view.itemScope;
  return scope !== null && scope !== undefined && 'refused' in scope ? scope.refused : null;
}

/** N for the "All N items | This item" switch over `inspected`; `null`: no switch. */
export function switchCountOf(inspected: Inspect, views: number, format: Format): number | null {
  const { list } = inspected;
  return scopeOf({ views, count: list?.copies ?? list?.count ?? 0, format, list });
}

/** An answer read for the item scope that carries no `itemScope` is an older plain one. */
export const lacksItemScope = (view: Inspect): boolean =>
  view.itemScope === null || view.itemScope === undefined;

type ScopeState = Pick<EditorState, 'selection' | 'copies' | 'inspected'>;

/**
 * In "This item", after a store change that is no new version: another copy picked (or none: back
 * to every item), or a plain answer that came in while the item's own class is shown, so the
 * element is read again for the scope.
 */
export function itemReread(
  state: ScopeState,
  previous: ScopeState,
): { scope: ScopeMode; read: boolean } {
  const copies = state.copies !== previous.copies;
  if (copies && itemTargetOf(state) === null) return { scope: 'all', read: true };
  const { inspected } = state;
  const plain =
    itemTargetOf(state) !== null &&
    inspected !== previous.inspected &&
    inspected !== null &&
    inspected.id === state.selection[0] &&
    lacksItemScope(inspected);
  return { scope: 'item', read: copies || plain };
}
