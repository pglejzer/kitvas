// What the schemas cannot say about a request or an answer (spec 4d, goals 1 and 2): every
// element id names a source file of the version, each kind carries what it needs, and an answer
// never changes an element the person locked (goal 4). Each problem points at its field, as a
// refused body does elsewhere.

import { type EditOp, fileOfId, idsOf } from '../../edit/index.ts';
import type { Translate } from '../../shared/index.ts';
import { SOURCE_PATH } from '../api/edit/edit-schemas.ts';
import type { NewRequest, Variant } from '../api/requests/request-schemas.ts';
import { type ProblemEntry, RequestError } from '../http/problem.ts';

/** `sections/Hero:…` names `src/tsx/sections/Hero.tsx`; a path that would leave `src/tsx/` does not. */
export const namesSourceFile = (id: string): boolean => SOURCE_PATH.test(fileOfId(id));

function opProblems(ops: readonly EditOp[], t: Translate): ProblemEntry[] {
  return ops.flatMap((op, index) => {
    if (idsOf(op).every(namesSourceFile)) return [];
    const pointer = `/ops/${index}${'id' in op ? '/id' : ''}`;
    return [{ pointer, detail: t('studio.edit.badElement') }];
  });
}

/** The problems of a new request; none when it may be kept. */
export function newRequestProblems(input: NewRequest, t: Translate): ProblemEntry[] {
  const problems: ProblemEntry[] = input.elements.flatMap((id, index) =>
    namesSourceFile(id)
      ? []
      : [{ pointer: `/elements/${index}`, detail: t('studio.edit.badElement') }],
  );
  problems.push(...opProblems(input.ops ?? [], t));
  // Say, Ask and a note carry the person's words; Improve and Why may come without any.
  const needsText = input.kind === 'say' || input.kind === 'ask' || input.kind === 'note';
  if (needsText && input.text === '') {
    problems.push({ pointer: '/text', detail: t('studio.requests.noText') });
  }
  // Say and Improve act on the selection.
  const needsElements = input.kind === 'say' || input.kind === 'improve';
  if (needsElements && input.elements.length === 0) {
    problems.push({ pointer: '/elements', detail: t('studio.requests.noElements') });
  }
  const note = input.note ?? null;
  if (input.kind === 'note' && note === null) {
    problems.push({ pointer: '/note', detail: t('studio.requests.noNote') });
  }
  if (input.kind !== 'note' && note !== null) {
    problems.push({ pointer: '/note', detail: t('studio.requests.noteOnly') });
  }
  if (input.kind !== 'ask' && (input.ops ?? []).length > 0) {
    problems.push({ pointer: '/ops', detail: t('studio.requests.opsOnly') });
  }
  return problems;
}

/** The problems of an answer's variants: changes of elements that are no source, or locked. */
export function variantProblems(
  variants: readonly Variant[],
  locked: ReadonlySet<string>,
  t: Translate,
): ProblemEntry[] {
  return variants.flatMap((variant, at) =>
    variant.changes.flatMap((change, index) => {
      const pointer = `/variants/${at}/changes/${index}/id`;
      if (!namesSourceFile(change.id)) return [{ pointer, detail: t('studio.edit.badElement') }];
      if (locked.has(change.id)) return [{ pointer, detail: t('studio.requests.locked') }];
      return [];
    }),
  );
}

/** Throws the problems as a refused body (422), when there are any. */
export function refuseProblems(problems: readonly ProblemEntry[]): void {
  if (problems.length > 0) throw new RequestError('BODY_INVALID', {}, { errors: [...problems] });
}
