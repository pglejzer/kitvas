// The timeline's calls to the studio API (plan 17, task D), with the page cookie: the draft's
// versions, whether one is built, an element's history, the preview of bringing it back, and the
// request to Claude when kitvas cannot. A network error answers as status 0, as in `../api.ts`.

import type { StyleContext } from '../../../../src/edit/index.ts';
import { isRecord } from '../../../../src/shared/values/guards.ts';
import { type Answer, call, draftPath } from '../../api/request.ts';
import { factsOf, type VersionFacts } from './facts.ts';
import type { ElementHistory, RestorePreview } from './points.ts';

const base = draftPath;

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

/** What the studio knows of one version for its row: date, screenshot, check. `null` if unread. */
export async function getVersionFacts(slug: string, version: number): Promise<VersionFacts | null> {
  const answer = await call('GET', `${base(slug)}/versions/${version}`);
  return answer.ok ? factsOf(answer.body) : null;
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
