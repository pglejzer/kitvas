// Which Layers rows are open: pure rules over plain data, tested without a DOM. The person's own
// fold and open choices (`{ [element id]: boolean }`) override the default: section rows (level 1)
// open, every deeper row with children folded. `row.ts` draws, `layers.ts` holds the choices.

import type { TreeNode } from '../../../channel/edit-protocol.ts';
import type { ModeStorage } from '../select/mode-memory.ts';
import type { LayerItem } from './facts.ts';

/** The person's explicit choices by element id: `true` open, `false` folded. */
export type Choices = Readonly<Record<string, boolean>>;

/** The most choices kept; the oldest go first. */
export const MAX_CHOICES = 500;

/** What the person chose for `id`, or `undefined` for no choice. */
function choiceOf(choices: Choices, id: string): boolean | undefined {
  return Object.hasOwn(choices, id) ? choices[id] : undefined;
}

/** `choices` cut to the newest `MAX_CHOICES` entries (insertion order is age). */
function capped(entries: Iterable<[string, boolean]>): Choices {
  const all = [...entries];
  return Object.fromEntries(all.length > MAX_CHOICES ? all.slice(all.length - MAX_CHOICES) : all);
}

/**
 * `choices` with `updates` applied, each as the newest entry. The same object comes back when every
 * update already holds, so a caller can tell nothing changed.
 */
function merged(choices: Choices, updates: readonly (readonly [string, boolean])[]): Choices {
  if (updates.every(([id, open]) => choiceOf(choices, id) === open)) return choices;
  const map = new Map(Object.entries(choices));
  for (const [id, open] of updates) {
    map.delete(id);
    map.set(id, open);
  }
  return capped(map);
}

/**
 * Whether a row with children draws them. While searching every row the filter left is open and
 * the choices are not consulted (they apply again when the search is cleared).
 */
export function isOpen(id: string, level: number, choices: Choices, searching: boolean): boolean {
  if (searching) return true;
  return choiceOf(choices, id) ?? level === 1;
}

/** `choices` plus one explicit choice for `id`. */
export function setOpen(id: string, open: boolean, choices: Choices): Choices {
  return merged(choices, [[id, open]]);
}

/**
 * `choices` with every ancestor of every selected element open, so each selected row is drawn.
 * Ids the tree does not hold are skipped. The same object comes back when nothing had to change.
 */
export function revealSelection(
  nodes: readonly TreeNode[],
  selection: readonly string[],
  choices: Choices,
): Choices {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const wanted = new Set<string>();
  for (const id of selection) {
    const seen = new Set<string>([id]);
    let parent = byId.get(id)?.parent ?? null;
    while (parent !== null && !seen.has(parent)) {
      seen.add(parent);
      if (choiceOf(choices, parent) !== true) wanted.add(parent);
      parent = byId.get(parent)?.parent ?? null;
    }
  }
  return merged(
    choices,
    [...wanted].map((id) => [id, true] as const),
  );
}

/** `choices` with `item` and every row under it that has children set to `open`. */
export function setSubtree(item: LayerItem, open: boolean, choices: Choices): Choices {
  const updates: (readonly [string, boolean])[] = [];
  const walk = (one: LayerItem): void => {
    if (one.children.length > 0) updates.push([one.node.id, open]);
    for (const child of one.children) walk(child);
  };
  walk(item);
  return merged(choices, updates);
}

/** The part of `sessionStorage` the folds use. */
export type FoldStorage = ModeStorage;

export const foldsKey = (slug: string): string => `kitvas.layers.folds:${slug}`;

/** The choices a stored value holds; junk, a wrong shape or no value is no choices. */
export function parseFolds(raw: string | null): Choices {
  if (raw === null) return {};
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return {};
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  const entries: [string, boolean][] = [];
  for (const [id, open] of Object.entries(value)) {
    if (typeof open === 'boolean') entries.push([id, open]);
  }
  return capped(entries);
}

export function readFolds(storage: FoldStorage | null, slug: string): Choices {
  try {
    return storage === null ? {} : parseFolds(storage.getItem(foldsKey(slug)));
  } catch {
    return {};
  }
}

export function writeFolds(storage: FoldStorage | null, slug: string, choices: Choices): void {
  try {
    storage?.setItem(foldsKey(slug), JSON.stringify(capped(Object.entries(choices))));
  } catch {
    // Without storage the folds are not kept; nothing else depends on them.
  }
}

/** What a key does on a focused row. */
export type TreeKeyAction = 'open' | 'fold' | 'first-child' | 'parent';

/** The facts of the focused row the key decision reads. */
export type TreeRow = { hasChildren: boolean; open: boolean; hasParent: boolean };

/**
 * The WAI-ARIA tree keys: ArrowRight opens a folded row and, on an open one, goes to its first
 * child; ArrowLeft folds an open row and, on a folded or leaf row, goes to the parent. `null`
 * for any other key or when there is nowhere to go.
 */
export function treeKey(key: string, row: TreeRow): TreeKeyAction | null {
  if (key === 'ArrowRight') {
    if (!row.hasChildren) return null;
    return row.open ? 'first-child' : 'open';
  }
  if (key === 'ArrowLeft') {
    if (row.hasChildren && row.open) return 'fold';
    return row.hasParent ? 'parent' : null;
  }
  return null;
}
