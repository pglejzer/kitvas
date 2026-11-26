// The trash's calls to the studio API, with the page cookie (`src/studio/api/trash/`). A network
// error answers as status 0.

import { draftPath, call as send } from '../api/request.ts';

export type Answer = { ok: true } | { ok: false; status: number; code: string | null };

/** Why a call failed, in the words the page has a text for. */
export type Failure = 'locked' | 'exists' | 'missing' | 'failed';

/** The problem details' `code` decides: another program holds the files, a name is taken, or gone. */
export function failureOf(answer: { status: number; code: string | null }): Failure {
  if (answer.code === 'DRAFT_LOCKED') return 'locked';
  if (answer.code === 'DRAFT_EXISTS') return 'exists';
  if (answer.code === 'DRAFT_NOT_FOUND') return 'missing';
  return 'failed';
}

/** Every call here sends an empty JSON body and needs no answer body, only whether it worked. */
async function call(method: 'DELETE' | 'POST', path: string): Promise<Answer> {
  const answer = await send(method, path, {});
  return answer.ok ? { ok: true } : answer;
}

const trashPath = (slug: string): string => `/api/v1/trash/${encodeURIComponent(slug)}`;

/** Moves the draft to the trash. */
export const deleteDraft = (slug: string): Promise<Answer> => call('DELETE', draftPath(slug));

/** Brings back the newest deleted copy of the draft. */
export const restoreDraft = (slug: string): Promise<Answer> =>
  call('POST', `${trashPath(slug)}/restore`);

/** Removes the deleted copies of the draft for good. */
export const purgeDraft = (slug: string): Promise<Answer> => call('DELETE', trashPath(slug));
