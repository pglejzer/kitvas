// The editor's calls to the studio API (plan 13, C3), with the page cookie. The shapes are the
// server's schemas (`src/studio/api/edit-schemas.ts`); a network error answers as status 0.

import type {
  EditEnd,
  EditOutcome,
  EditRequest,
  EditState,
  Inspect,
  OffKit,
} from '../../../src/studio/api/edit-schemas.ts';

export type Answer<T> =
  | { ok: true; status: number; body: T }
  | { ok: false; status: number; code: string | null };

async function call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<Answer<T>> {
  try {
    const response = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const read: unknown = await response.json().catch(() => undefined);
    if (response.ok) return { ok: true, status: response.status, body: read as T };
    const code =
      typeof read === 'object' && read !== null && 'code' in read && typeof read.code === 'string'
        ? read.code
        : null;
    return { ok: false, status: response.status, code };
  } catch {
    return { ok: false, status: 0, code: null };
  }
}

const base = (slug: string): string => `/api/v1/drafts/${encodeURIComponent(slug)}`;

export const getEditState = (slug: string): Promise<Answer<EditState>> =>
  call('GET', `${base(slug)}/edits`);

export const inspect = (slug: string, id: string): Promise<Answer<Inspect>> =>
  call('GET', `${base(slug)}/inspect?id=${encodeURIComponent(id)}`);

export const postEdits = (slug: string, request: EditRequest): Promise<Answer<EditOutcome>> =>
  call('POST', `${base(slug)}/edits`, request);

export const endSession = (slug: string): Promise<Answer<EditEnd>> =>
  call('POST', `${base(slug)}/edits/end`, {});

export const getOffKit = (slug: string): Promise<Answer<OffKit>> =>
  call('GET', `${base(slug)}/off-kit`);
