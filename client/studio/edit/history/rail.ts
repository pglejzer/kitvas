// The Changes rail's decisions as plain data (plan 18, task D): which step carries its own undo,
// the version the rail ends at, and what the pane's foot says. No DOM; `changes.ts` draws them.

import type { EditState } from '../../../../src/studio/api/edit/edit-schemas.ts';
import type { ChangeEntry, Gesture } from '../store.ts';

/**
 * The step (an index of the newest-first list) whose undo is the bar's undo: the newest line,
 * when the person made it and the top of the undo stack is that very step. `-1` for none: a
 * change by Claude is not what undo takes back next.
 */
export function undoableIndex(newest: readonly ChangeEntry[], top: Gesture | undefined): number {
  const [first] = newest;
  if (first === undefined || top === undefined) return -1;
  return first.by === 'person' && first.label === top.label ? 0 : -1;
}

/**
 * The last saved version, where the rail ends: with a session open its edits go into a new
 * version, so the one before it; without one, the latest. `null` until the state is read.
 */
export function savedVersion(edit: Pick<EditState, 'version' | 'session'> | null): number | null {
  if (edit === null) return null;
  const version = edit.session === null ? edit.version : edit.session.version - 1;
  return version >= 1 ? version : null;
}

/** What the foot says beside Save version: how many steps are not in a version yet. */
export function footNote(
  undo: readonly Gesture[],
  open: boolean,
): { key: string; params: Record<string, number> } | null {
  if (!open || undo.length === 0) return null;
  const count = undo.length;
  return { key: count === 1 ? 'changes.unsavedOne' : 'changes.unsaved', params: { count } };
}

/** Whether a new line came since the rail was drawn: its row flashes once. */
export const isFresh = (shown: number, now: number): boolean => now > shown;
