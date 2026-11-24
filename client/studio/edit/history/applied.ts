// The note the history leaves after each applied request (stage 4c, plan 16): which elements it
// touched, in the ids after it, and the server's code findings of the files it changed. Live
// checks (task C) measure those elements once the build shows.

import type { EditOp } from '../../../../src/edit/index.ts';
import type { EditOutcome } from '../../../../src/studio/api/edit/edit-schemas.ts';
import type { EditorState } from '../store.ts';

type Applied = Extract<EditOutcome, { outcome: 'applied' }>;

/** The element ids an op names (its element, an anchor, the ends of a wrap). */
function idsOfOp(op: EditOp): string[] {
  if ('id' in op) return [op.id];
  if ('anchor' in op) return [op.anchor];
  if ('first' in op) return [op.first, op.last];
  return [];
}

export function appliedNote(
  previous: EditorState['applied'],
  ops: readonly EditOp[],
  outcome: Applied,
): NonNullable<EditorState['applied']> {
  const named = [...ops.flatMap(idsOfOp), ...outcome.created];
  const ids = [...new Set(named.map((id) => outcome.renames[id] ?? id))];
  return { count: (previous?.count ?? 0) + 1, ids, live: outcome.live ?? [] };
}
