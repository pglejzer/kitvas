// The AI tab's calls to the studio API (spec 4d, goal 1; plan 17, C3 routes of task A), with the
// page cookie: the draft's requests and the listening state, a new request, and Drop. Ask Claude
// (`history/ask.ts`) and the notes (task C) post their requests here too. A network error, a
// refusal or an answer of another shape gives `null` or `false`; the tab says so.

import type { NewRequest, Requests } from '../../../../src/studio/api/requests/request-schemas.ts';
import { call, draftPath } from '../../api/request.ts';
import { readRequests } from './requests.ts';

const base = (slug: string): string => `${draftPath(slug)}/requests`;

async function post(path: string, body: unknown): Promise<boolean> {
  return (await call('POST', path, body)).ok;
}

/** `GET …/requests`: the draft's requests, newest first, and whether a session listens. */
export async function getRequests(slug: string): Promise<Requests | null> {
  const answer = await call('GET', base(slug));
  return answer.ok ? readRequests(answer.body) : null;
}

/** `POST …/requests`: kept on disk until Claude answers it (spec 4d, goal 1). */
export const postRequest = (slug: string, request: NewRequest): Promise<boolean> =>
  post(base(slug), request);

/** `POST …/requests/{id}/drop`: the person takes a waiting request back. */
export const dropRequest = (slug: string, id: string): Promise<boolean> =>
  post(`${base(slug)}/${encodeURIComponent(id)}/drop`, {});
