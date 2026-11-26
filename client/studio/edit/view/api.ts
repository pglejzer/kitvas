// The view's calls to the studio API (spec 4d, goal 4; plan 17, task C), with the page cookie:
// both lists, writing them whole, and the edit that restores a changed lock. A network error
// answers as status 0, as in `../api.ts`.

import type { Zod } from '../../../../src/shared/index.ts';
import type { RestorePreviewSchema } from '../../../../src/studio/api/history/history-schemas.ts';
import { type Answer, draftPath, call as send } from '../../api/request.ts';
import { readView, type ViewAnswer } from './model.ts';

export type LockRestore = Zod.infer<typeof RestorePreviewSchema>;

const base = (slug: string): string => `${draftPath(slug)}/view`;

/** A GET without a body, a POST with one. */
const call = (path: string, body?: unknown): Promise<Answer<unknown>> =>
  send(body === undefined ? 'GET' : 'POST', path, body);

export async function getView(slug: string): Promise<ViewAnswer | null> {
  const answer = await call(base(slug));
  return answer.ok ? readView(answer.body) : null;
}

export async function postView(
  slug: string,
  lists: { locked: string[]; hidden: string[] },
): Promise<ViewAnswer | null> {
  const answer = await call(base(slug), lists);
  return answer.ok ? readView(answer.body) : null;
}

/** The edit that puts the lock's kept source back; the server's own schema, checked there. */
export async function postLockRestore(slug: string, id: string): Promise<Answer<LockRestore>> {
  const answer = await call(`${base(slug)}/restore`, { id });
  return answer.ok ? { ...answer, body: answer.body as LockRestore } : answer;
}
