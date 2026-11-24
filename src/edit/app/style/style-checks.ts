// What a request's style ops need from the version beside their texts (plan 15, task C): which
// images its `src/img` folder has, and whether the client's inverse of the ops could be written
// back. A keyword or image property refuses a value outside its list (`style-values.ts`), so a
// change from a value someone else wrote there (`align-items: start`) is undone by the file's own
// hunks instead of by an op that would be refused. Plan 16 adds the same care for the context
// blocks and the utility classes: where the inverse ops would not give the file back byte for
// byte, the hunks undo the request.

import { versionFolder } from '../../../drafts/index.ts';
import { fileOfId, inverseAll, type SimpleOp } from '../../domain/ops.ts';
import { applyScss, IMAGE_FILE, styleValueRefusal } from '../../domain/style/apply-scss.ts';
import type { Work } from '../request-state.ts';

type Version = Pick<Work, 'deps' | 'slug' | 'version'>;

/** The version the request reads has `src/img/<file>`; a name with a folder in it never matches. */
export function imagesOf(work: Version): (file: string) => boolean {
  const base = versionFolder(work.version);
  return (file) =>
    IMAGE_FILE.test(file) && work.deps.drafts.exists(work.slug, `${base}/src/img/${file}`);
}

/** A style op of a width or a state (spec 4c). */
const inContext = (op: SimpleOp): boolean =>
  (op.op === 'setStyle' || op.op === 'removeStyle') &&
  op.context !== undefined &&
  (op.context.width !== null || op.context.state !== null);

/**
 * The inverse ops, applied to the SCSS texts the request made, give back the texts it read. A
 * block someone wrote in another place or shape than kitvas would is not made again as it was by
 * an op, so this is tried, never assumed.
 */
function scssUndoExact(work: Version & Pick<Work, 'files'>, ops: readonly SimpleOp[]): boolean {
  const hasImage = imagesOf(work);
  const texts = new Map<string, string>();
  for (const op of inverseAll(ops)) {
    if (op.op !== 'setStyle' && op.op !== 'removeStyle') continue;
    const file = work.deps.sectionScss(work.slug, work.version, fileOfId(op.id));
    const made = file === null ? null : (texts.get(file) ?? work.files.get(file)?.text ?? null);
    if (file === null || made === null) return false;
    const result = applyScss(made, op, { force: false, hasImage });
    if (!('text' in result)) return false;
    texts.set(file, result.text);
  }
  return [...texts].every(([file, text]) => work.files.get(file)?.read === text);
}

/** A `className` with only spaces in its quotes, which takes a class inside them (spec 4d). */
const EMPTY_CLASS = /\bclassName=(["'])\s*\1/;

/**
 * A utility class added where the file as read has an empty `className`: taking it out again
 * removes the whole attribute, so only the hunks give the file back (spec 4d, goal 8).
 */
function addsToEmptyClass(files: Work['files'] | undefined, op: SimpleOp): boolean {
  if (op.op !== 'setUtility' || op.before !== null) return false;
  const read = files?.get(fileOfId(op.id))?.read;
  return typeof read === 'string' && EMPTY_CLASS.test(read);
}

/**
 * Every op's old value may be written again, so the inverses made from the ops alone undo them
 * (spec 4a, decision 5). A style op whose `before` its property would refuse needs the hunks; so
 * does a utility class taken out (its inverse adds it at the end, not where it was), one added to
 * an empty `className`, and a request of context ops whose inverses do not give its files back
 * exactly.
 */
export function undoableByOps(
  work: Version & { files?: Work['files'] | undefined },
  ops: readonly SimpleOp[],
): boolean {
  const hasImage = imagesOf(work);
  const writable = ops.every((op) => {
    if (op.op === 'setUtility') return op.value !== null && !addsToEmptyClass(work.files, op);
    if (op.op !== 'setStyle' && op.op !== 'removeStyle') return true;
    return op.before === null || styleValueRefusal(op.property, op.before, hasImage) === null;
  });
  if (!writable || !ops.some(inContext)) return writable;
  const { files } = work;
  return files !== undefined && scssUndoExact({ ...work, files }, ops);
}
