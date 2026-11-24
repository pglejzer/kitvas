// Data lists (spec 4c, goal 9; plan 16, task D): the item ops move, copy, remove or retext one
// element of the literal array a `.map` renders. The element is found where the request's earlier
// ops left it (`request-state.ts`), the engine splices the array's text (`domain/list-edit.ts`),
// and the change is kept like any structural op's, so the server's inverse follows from the text.
// The kit import is left alone: a list edit rewrites only the touched items' text.

import { applyListEdit, type ListOp } from '../../domain/list/edit.ts';
import { commit, locate, type OpResult, type Work } from '../request-state.ts';

export type { ListOp };

export async function applyListOp(work: Work, index: number, op: ListOp): Promise<OpResult> {
  const found = await locate(work, op.id);
  if (!('at' in found)) return found;
  const result = applyListEdit(found.text, found.at, op, work.options);
  if ('refused' in result) return { refused: result.refused };
  if ('conflict' in result) return { conflict: 'changed', file: found.file };
  if (result.text !== found.text) commit(work, found.file, index, result.text, result.moved);
  return 'done';
}
