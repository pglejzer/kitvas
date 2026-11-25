// "This item" in a request (ADR 0072): `addItemClass` puts the modifier of the element's style
// class, named by its list's key, into its `className`, so a style op after it in the same
// gesture writes the rule of one copy (`plans__card--pro`, nested in `.plans` as ADR 0067 places
// it). The class is read again here from the text as the request has it, as the inspect read it:
// another class for the copy is a conflict (the list or the class changed), and a `className`
// that gives the modifier already is left alone. The answer's inverse is the file's own hunks.

import { addItemClassText, itemClassAt } from '../../domain/list/item-class.ts';
import type { ItemClassOp } from '../../domain/ops.ts';
import { readTag } from '../../domain/tsx/apply-tsx.ts';
import { pickStyleClass } from '../inspect.ts';
import {
  commit,
  componentOf,
  kitOf,
  locate,
  type OpResult,
  stateOf,
  type Work,
} from '../request-state.ts';

/** Applies one `addItemClass` on the texts of the request. */
export async function applyItemClass(
  work: Work,
  index: number,
  op: ItemClassOp,
): Promise<OpResult> {
  const found = await locate(work, op.id);
  if (!('at' in found)) return found;
  const tag = readTag(found.text, found.at);
  if (typeof tag === 'string') return { refused: tag };
  const scssFile = work.deps.sectionScss(work.slug, work.version, found.file);
  const scss = scssFile === null ? undefined : (stateOf(work, scssFile).text ?? undefined);
  const component = componentOf(kitOf(work).loaded, tag.name);
  // The class the panel's rows write for every item; a new one is no class of all the copies yet.
  const base = pickStyleClass(tag, component, found.text, scss, found.file);
  if (base === null || !base.exists) return { refused: 'no-classname' };
  const item = itemClassAt(found.text, found.at, op.path, base.className);
  if (typeof item === 'string') return { refused: item };
  if (item.className !== op.className) return { conflict: 'changed', file: found.file };
  if (item.inTsx) return 'done';
  const written = addItemClassText(found.text, found.at, base.className, item.expr);
  if ('refused' in written) return written;
  commit(work, found.file, index, written.text, written.moved);
  return 'done';
}
