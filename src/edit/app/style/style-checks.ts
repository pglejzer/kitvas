// What a request's style ops need from the version beside their texts (plan 15, task C): which
// images its `src/img` folder has, and whether the client's inverse of the ops could be written
// back. A keyword or image property refuses a value outside its list (`style-values.ts`), so a
// change from a value someone else wrote there (`align-items: start`) is undone by the file's own
// hunks instead of by an op that would be refused. Plan 16 adds the same care for the context
// blocks and the utility classes: where the inverse ops would not give the file back byte for
// byte, the hunks undo the request.

import { versionFolder } from '../../../drafts/index.ts';
import { fileOfId, inverseAll, isBaseContext, type SimpleOp } from '../../domain/ops.ts';
import {
  applyScss,
  IMAGE_FILE,
  type ScssOptions,
  shorthandsOf,
  styleValueRefusal,
  type VarKind,
  varKindOf,
} from '../../domain/style/apply-scss.ts';
import { tokenGroupsOf } from '../../domain/style/source.ts';
import { isStyleProperty } from '../../domain/types.ts';
import { tokenOptions } from '../edit-state.ts';
import { kitOf, optionsOf, type Work } from '../request-state.ts';

type Version = Pick<Work, 'deps' | 'slug' | 'version'>;

/** The version the request reads has `src/img/<file>`; a name with a folder in it never matches. */
export function imagesOf(work: Version): (file: string) => boolean {
  const base = versionFolder(work.version);
  return (file) =>
    IMAGE_FILE.test(file) && work.deps.drafts.exists(work.slug, `${base}/src/img/${file}`);
}

/**
 * What types a `var(--kit-…)` for the request, from its kit's tokens as the inspect answer reads
 * them, so the writer splits a shorthand where the panel showed it split (ADR 0070). The kit is
 * loaded only when a value has a `var` to type.
 */
function varKindFor(work: Work): VarKind {
  let known: VarKind | undefined;
  return (name) => {
    known ??= varKindOf(tokenGroupsOf(tokenOptions(kitOf(work).loaded)));
    return known(name);
  };
}

/**
 * What a style op of the request is applied with: its options, its images, its token types, and
 * the version's options, which place a new option's block (ADR 0082).
 */
export function scssOptions(work: Work): ScssOptions {
  return {
    ...work.options,
    hasImage: imagesOf(work),
    varKind: varKindFor(work),
    versionOptions: () => optionsOf(work),
  };
}

/** A style op of a width, a state or an option (spec 4c, ADR 0082). */
const inContext = (op: SimpleOp): boolean =>
  (op.op === 'setStyle' || op.op === 'removeStyle') &&
  op.context !== undefined &&
  !isBaseContext(op.context);

/** A style op of a property a shorthand may hold: it may have written into one (ADR 0070). */
const maybeInShorthand = (op: SimpleOp): boolean =>
  (op.op === 'setStyle' || op.op === 'removeStyle') &&
  isStyleProperty(op.property) &&
  shorthandsOf(op.property).length > 0;

/**
 * The inverse ops, applied to the SCSS texts the request made, give back the texts it read. A
 * block someone wrote in another place or shape than kitvas would is not made again as it was by
 * an op, and neither is a shorthand whose part moved, left or took the marker along, so this is
 * tried, never assumed.
 */
function scssUndoExact(work: Work, ops: readonly SimpleOp[]): boolean {
  const options: ScssOptions = {
    force: false,
    hasImage: imagesOf(work),
    varKind: varKindFor(work),
    versionOptions: () => optionsOf(work),
  };
  const texts = new Map<string, string>();
  for (const op of inverseAll(ops)) {
    if (op.op !== 'setStyle' && op.op !== 'removeStyle') continue;
    const file = work.deps.sectionScss(work.slug, work.version, fileOfId(op.id));
    const made = file === null ? null : (texts.get(file) ?? work.files.get(file)?.text ?? null);
    if (file === null || made === null) return false;
    const result = applyScss(made, op, options);
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
 * an empty `className`, and a request of context ops, or of ops on properties a shorthand may
 * hold, whose inverses do not give its files back exactly.
 */
export function undoableByOps(work: Work, ops: readonly SimpleOp[]): boolean {
  const hasImage = imagesOf(work);
  const writable = ops.every((op) => {
    if (op.op === 'setUtility') return op.value !== null && !addsToEmptyClass(work.files, op);
    if (op.op !== 'setStyle' && op.op !== 'removeStyle') return true;
    return op.before === null || styleValueRefusal(op.property, op.before, hasImage) === null;
  });
  const tried = ops.some((op) => inContext(op) || maybeInShorthand(op));
  return writable && (!tried || scssUndoExact(work, ops));
}
