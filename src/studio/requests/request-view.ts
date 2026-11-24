// A stored request as the editor and Claude see it (spec 4d, goals 1 and 2): its element ids, and
// those of its variants, carried to the latest version through the rename logs (ADR 0052), as
// waivers are, so a request follows its elements when the person moves them.

import {
  type DraftStore,
  followRenames,
  type RenameLike,
  readRenames,
} from '../../drafts/index.ts';
import type { RequestAnswer, RequestView } from '../api/requests/request-schemas.ts';
import type { StoredRequest } from './request-file.ts';

/** An id as the latest version names it, from the version and the time it was named at. */
export type Carry = (id: string, version: number, at: string) => string;

/** Follows ids to version `latest`; each version's log is read once. */
export function carrierFor(drafts: DraftStore, slug: string, latest: number): Carry {
  const logs = new Map<number, readonly RenameLike[]>();
  const stepsOf = (version: number): readonly RenameLike[] => {
    const known = logs.get(version);
    if (known) return known;
    const steps = readRenames(drafts, slug, version);
    logs.set(version, steps);
    return steps;
  };
  return (id, version, at) => {
    // The later steps of the version it was named in (a session goes on writing its log), then
    // every step of the versions after it.
    const steps: RenameLike[] = [];
    for (let each = version; each <= latest; each += 1) {
      const all = stepsOf(each);
      steps.push(...(each === version ? all.filter((step) => step.at > at) : all));
    }
    return followRenames(id, steps);
  };
}

/** The request's elements as the latest version names them, in the request's order. */
export const currentElements = (request: StoredRequest, carry: Carry): string[] =>
  request.elements.map((id) => carry(id, request.version, request.at));

/** Variants name elements as the version of the answer did; the view names them as now. */
function carriedAnswer(request: StoredRequest, carry: Carry): RequestAnswer | null {
  const { answer, answeredAt, answeredVersion } = request;
  if (answer === null || answer.kind !== 'variants') return answer;
  if (answeredAt === null || answeredVersion === null) return answer;
  return {
    kind: 'variants',
    variants: answer.variants.map((variant) => ({
      label: variant.label,
      changes: variant.changes.map((change) => ({
        ...change,
        id: carry(change.id, answeredVersion, answeredAt),
      })),
    })),
  };
}

export function viewOf(request: StoredRequest, carry: Carry, stale: boolean): RequestView {
  return {
    id: request.id,
    kind: request.kind,
    elements: currentElements(request, carry),
    context: request.context,
    text: request.text,
    version: request.version,
    at: request.at,
    status: request.status,
    note: request.note,
    stale,
    answer: carriedAnswer(request, carry),
  };
}
