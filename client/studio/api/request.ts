// The one request the studio's pages make to the studio API, with the page cookie: JSON in, JSON
// out, and an answer that says what happened. A network error answers as status 0. Each pane's
// `api.ts` keeps its own functions and answers on top of this.

import { isRecord } from '../../../src/shared/values/guards.ts';

export type Answer<T> =
  | { ok: true; status: number; body: T }
  | { ok: false; status: number; code: string | null };

export type Method = 'GET' | 'POST' | 'DELETE';

/** The API path of one draft, the slug encoded. */
export const draftPath = (slug: string): string => `/api/v1/drafts/${encodeURIComponent(slug)}`;

/**
 * Sends one request. `body` left out sends none (a GET); a body, even `{}`, goes as JSON. The answer
 * body is what the server sent, read as `unknown` and cast by the caller to the schema it checked
 * on its side; `code` is the problem details' `code` of a refusal, `null` when there is none.
 */
export async function call<T = unknown>(
  method: Method,
  path: string,
  body?: unknown,
): Promise<Answer<T>> {
  try {
    const response = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const read: unknown = await response.json().catch(() => undefined);
    if (response.ok) return { ok: true, status: response.status, body: read as T };
    const code = isRecord(read) && typeof read.code === 'string' ? read.code : null;
    return { ok: false, status: response.status, code };
  } catch {
    return { ok: false, status: 0, code: null };
  }
}
