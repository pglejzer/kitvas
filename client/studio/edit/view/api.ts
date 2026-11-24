// The view's calls to the studio API (spec 4d, goal 4; plan 17, task C), with the page cookie:
// both lists, writing them whole, and the edit that restores a changed lock. A network error
// answers as status 0, as in `../api.ts`.

import type { Zod } from '../../../../src/shared/index.ts';
import type { RestorePreviewSchema } from '../../../../src/studio/api/history/history-schemas.ts';
import type { Answer } from '../api.ts';
import { readView, type ViewAnswer } from './model.ts';

export type LockRestore = Zod.infer<typeof RestorePreviewSchema>;

const base = (slug: string): string => `/api/v1/drafts/${encodeURIComponent(slug)}/view`;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

async function call(path: string, body?: unknown): Promise<Answer<unknown>> {
  try {
    const response = await fetch(path, {
      method: body === undefined ? 'GET' : 'POST',
      credentials: 'same-origin',
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const read: unknown = await response.json().catch(() => undefined);
    if (response.ok) return { ok: true, status: response.status, body: read };
    const code = isRecord(read) && typeof read.code === 'string' ? read.code : null;
    return { ok: false, status: response.status, code };
  } catch {
    return { ok: false, status: 0, code: null };
  }
}

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
