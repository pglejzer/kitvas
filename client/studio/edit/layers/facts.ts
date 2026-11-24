// What a Layers row says besides its name, and how a flat tree nests: pure rules over plain data,
// tested without a DOM. The markup is `row.ts`; the tree, the drag and the keys are `layers.ts`.

import type { TreeNode } from '../../../channel/edit-protocol.ts';
import type { ChangeEntry } from '../store.ts';
import type { ListKind } from '../structure/lists.ts';
import { text } from '../texts.ts';

export type LayerItem = { node: TreeNode; children: LayerItem[] };

/** The "× n" badge shows for an item of a mapped list only; the count, or `null`. */
export function badgeCount(node: TreeNode): number | null {
  return node.count > 1 ? node.count : null;
}

/** The elements the person changed in this session, from the change list's ids. */
export function changedIds(changes: readonly ChangeEntry[]): Set<string> {
  const ids = new Set<string>();
  for (const change of changes) {
    if (change.by === 'person' && change.id !== null) ids.add(change.id);
  }
  return ids;
}

/**
 * What a row shows besides its name: the kit marker, the "× n" badge with the kind of list that
 * renders the element (spec 4c, goal 9; `null` while unknown), and the changed dot.
 */
export type RowFacts = {
  kit: boolean;
  count: number | null;
  changed: boolean;
  kind: ListKind | null;
};

/** `component` is the structure's kit component of the element (`null`: a plain element). */
export function rowFacts(
  node: TreeNode,
  component: string | null | undefined,
  changed: ReadonlySet<string>,
  kind: ListKind | null = null,
): RowFacts {
  const count = badgeCount(node);
  return {
    kit: component !== null && component !== undefined,
    count,
    changed: changed.has(node.id),
    kind: count === null ? null : kind,
  };
}

/** A structure entry, with the kind of list that renders it once the structure says so. */
export type Listed = { id: string; list?: ListKind | null };

/** The kind of list that renders `id`: the structure's word, else what an inspect of it said. */
export function listKindOf(
  entry: Listed | undefined,
  known: ReadonlyMap<string, ListKind>,
  id: string,
): ListKind | null {
  return entry?.list ?? known.get(id) ?? null;
}

/** The badge of a row: "× 3", or "× 3 data" with what kind of list it is; `null` for none. */
export function badgeOf(facts: RowFacts): { label: string; title: string | null } | null {
  const { count, kind } = facts;
  if (count === null) return null;
  if (kind === null) return { label: text('layers.count', { count }), title: null };
  const label = text('layers.countKind', { count, kind: text(`layers.kind.${kind}`) });
  return { label, title: text(`layers.kindTitle.${kind}`) };
}

/** Nests a flat tree in document order; a node whose parent is not in the list is a root. */
export function nestTree(nodes: TreeNode[]): LayerItem[] {
  const items = new Map<string, LayerItem>();
  for (const node of nodes) items.set(node.id, { node, children: [] });
  const roots: LayerItem[] = [];
  for (const node of nodes) {
    const item = items.get(node.id);
    if (!item) continue;
    const parent = node.parent === null ? undefined : items.get(node.parent);
    (parent ? parent.children : roots).push(item);
  }
  return roots;
}
