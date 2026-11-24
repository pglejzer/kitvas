// What a request's style ops need from the version beside their texts (plan 15, task C): which
// images its `src/img` folder has, and whether the client's inverse of the ops could be written
// back. A keyword or image property refuses a value outside its list (`style-values.ts`), so a
// change from a value someone else wrote there (`align-items: start`) is undone by the file's own
// hunks instead of by an op that would be refused.

import { versionFolder } from '../../drafts/index.ts';
import { IMAGE_FILE, styleValueRefusal } from '../domain/apply-scss.ts';
import type { SimpleOp } from '../domain/ops.ts';
import type { Work } from './request-state.ts';

/** The version the request reads has `src/img/<file>`; a name with a folder in it never matches. */
export function imagesOf(work: Pick<Work, 'deps' | 'slug' | 'version'>): (file: string) => boolean {
  const base = versionFolder(work.version);
  return (file) =>
    IMAGE_FILE.test(file) && work.deps.drafts.exists(work.slug, `${base}/src/img/${file}`);
}

/**
 * Every op's old value may be written again, so the inverses made from the ops alone undo them
 * (spec 4a, decision 5). A style op whose `before` its property would refuse needs the hunks.
 */
export function undoableByOps(
  work: Pick<Work, 'deps' | 'slug' | 'version'>,
  ops: readonly SimpleOp[],
): boolean {
  const hasImage = imagesOf(work);
  return ops.every((op) => {
    if (op.op !== 'setStyle' && op.op !== 'removeStyle') return true;
    return op.before === null || styleValueRefusal(op.property, op.before, hasImage) === null;
  });
}
