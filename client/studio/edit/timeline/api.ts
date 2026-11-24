// The timeline's calls to the studio API (plan 17, task D), with the page cookie: the draft's
// versions, whether one is built, an element's history, the preview of bringing it back, and the
// request to Claude when kitvas cannot. A network error answers as status 0, as in `../api.ts`.

import type { StyleContext } from '../../../../src/edit/index.ts';
import type { Answer } from '../api.ts';
import type { ElementHistory, RestorePreview } from './points.ts';

async function call(
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
): Promise<Answer<unknown>> {
  try {
    const response = await fetch(path, {
      method,
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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const base = (slug: string): string => `/api/v1/drafts/${encodeURIComponent(slug)}`;

/** The version numbers of a draft as `GET /api/v1/drafts/{slug}` lists them; none for bad data. */
export function versionsOf(draft: unknown): number[] {
  if (!isRecord(draft) || !Array.isArray(draft.versions)) return [];
  return draft.versions.flatMap((entry: unknown): number[] =>
    isRecord(entry) && typeof entry.number === 'number' && Number.isInteger(entry.number)
      ? [entry.number]
      : [],
  );
}

export async function getVersions(slug: string): Promise<number[]> {
  const answer = await call('GET', base(slug));
  return answer.ok ? versionsOf(answer.body) : [];
}

/** Whether the version has a build to frame; `null` when the studio did not say. */
export async function isBuilt(slug: string, version: number): Promise<boolean | null> {
  const answer = await call('GET', `${base(slug)}/versions/${version}`);
  if (!answer.ok || !isRecord(answer.body)) return null;
  return answer.body.built === true;
}

// The two answers below are the server's own schemas, checked there before they are sent.

export async function getHistory(slug: string, id: string): Promise<ElementHistory | null> {
  const answer = await call('GET', `${base(slug)}/history?id=${encodeURIComponent(id)}`);
  return answer.ok ? (answer.body as ElementHistory) : null;
}

export async function postRestore(
  slug: string,
  request: { id: string; version: number },
): Promise<Answer<RestorePreview>> {
  const answer = await call('POST', `${base(slug)}/restore`, request);
  return answer.ok ? { ...answer, body: answer.body as RestorePreview } : answer;
}

/** An `ask` request about one element (the requests route of plan 17, task A). */
export async function postAsk(
  slug: string,
  request: { element: string; context: StyleContext; text: string },
): Promise<boolean> {
  const body = {
    kind: 'ask',
    elements: [request.element],
    context: request.context,
    text: request.text,
  };
  return (await call('POST', `${base(slug)}/requests`, body)).ok;
}
