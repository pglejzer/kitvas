// The Claude tab's small rules (spec 4d, goal 2; plan 17, task B; moved out of `ai.ts` in plan
// 18): how a request names its elements, which elements Ask again keeps, and when a variant can
// be tried. Pure.

import type { TreeNode } from '../../../channel/edit-protocol.ts';
import { elementName } from '../history/changes.ts';
import type { EditorState } from '../store.ts';
import type { ElementView } from './variants.ts';

/** The longest layer name a request's line shows. */
const MAX_NAME = 40;

/** Names by the layers tree, else by the id's own parts (`Hero / Button`). */
export function namesOf(tree: readonly TreeNode[]): (id: string) => string {
  const names = new Map(tree.map((node) => [node.id, node.name]));
  return (id) => {
    const name = names.get(id)?.trim() ?? '';
    if (name === '') return elementName(id);
    return name.length > MAX_NAME ? `${name.slice(0, MAX_NAME - 1)}…` : name;
  };
}

/** Whether an element is in the draft now; until the tree is read, every one counts as there. */
export function presenceOf(tree: readonly TreeNode[]): (id: string) => boolean {
  if (tree.length === 0) return () => true;
  const ids = new Set(tree.map((node) => node.id));
  return (id) => ids.has(id);
}

/** Why no variant can be tried now (a text key); `null` when one can. */
export function blockedOf(state: Pick<EditorState, 'on' | 'viewing'>): string | null {
  if (state.viewing !== null) return 'ai.blocked.viewing';
  return state.on ? null : 'ai.blocked.edit';
}

/** An inspect answer that is not one: a 404 or 400 is an element not in the draft now. */
export const missing = (status: number): ElementView =>
  status === 404 || status === 400 ? 'gone' : 'unread';
