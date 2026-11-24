// Selection rules of the editor, pure over plain data (plan 13, task F).

import type { TreeNode } from '../../../channel/edit-protocol.ts';

/**
 * A click replaces the selection; with the add modifier (Shift, Ctrl or Cmd: `add`) it adds the
 * element, or removes it when it is selected already. A click outside clears, unless with it.
 */
export function nextSelection(
  current: string[],
  pick: { id: string | null; add: boolean },
): string[] {
  if (pick.id === null) return pick.add ? current : [];
  if (!pick.add) return [pick.id];
  return current.includes(pick.id) ? current.filter((id) => id !== pick.id) : [...current, pick.id];
}

/** The id of the node's parent; `null` at the top or for an unknown id. */
export function parentOf(tree: TreeNode[], id: string): string | null {
  return tree.find((node) => node.id === id)?.parent ?? null;
}

/** The first child in document order; `null` when the node has none. */
export function firstChildOf(tree: TreeNode[], id: string): string | null {
  return tree.find((node) => node.parent === id)?.id ?? null;
}

/** The tag part of an id: the last path segment after the file stem (`a/B:section/Stack` → `Stack`). */
export function tagOfId(id: string): string {
  const path = id.includes(':') ? id.slice(id.indexOf(':') + 1) : id;
  // `Card.2` is the second Card; `Card.Header` is a part and keeps its name.
  return path.slice(path.lastIndexOf('/') + 1).replace(/\.\d+$/, '');
}

/**
 * The nodes whose name or tag contains the query (case-insensitive), plus their ancestors so the
 * tree still reads. An empty query keeps everything.
 */
export function filterTree(tree: TreeNode[], query: string): TreeNode[] {
  const needle = query.trim().toLowerCase();
  if (needle === '') return tree;
  const byId = new Map(tree.map((node) => [node.id, node]));
  const keep = new Set<string>();
  for (const node of tree) {
    const hit =
      node.name.toLowerCase().includes(needle) || tagOfId(node.id).toLowerCase().includes(needle);
    if (!hit) continue;
    let at: TreeNode | undefined = node;
    while (at && !keep.has(at.id)) {
      keep.add(at.id);
      at = at.parent === null ? undefined : byId.get(at.parent);
    }
  }
  return tree.filter((node) => keep.has(node.id));
}
