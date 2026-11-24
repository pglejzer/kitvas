// How a request's status moves (spec 4d, goals 1 and 9; plan 17, task A). Pure: lists in, lists
// out; `requests.ts` reads and writes the file around them.
//
//   waiting --take--> taken --answer/done--> answered
//      ^                |  \--fail--------> failed
//      +---15 minutes---+
//   waiting, taken, answered, failed --drop--> dropped (the person took it back)
//
// Only a `taken` request takes Claude's answer: one that waits again, was answered or was dropped
// refuses it, so a late session never overwrites what the person sees.

import { KitvasError } from '../../shared/index.ts';
import {
  MAX_OPEN_REQUESTS,
  type RequestAnswer,
  TAKEN_TIMEOUT_MS,
} from '../api/requests/request-schemas.ts';
import { isOpen, type StoredRequest } from './request-file.ts';

export type Moved = { requests: StoredRequest[]; request: StoredRequest };

export const openCount = (requests: readonly StoredRequest[]): number =>
  requests.filter(isOpen).length;

/** The request `id`; throws `REQUEST_NOT_FOUND`. */
export function findRequest(requests: readonly StoredRequest[], id: string): StoredRequest {
  const found = requests.find((request) => request.id === id);
  if (!found) throw new KitvasError('REQUEST_NOT_FOUND', { id });
  return found;
}

const replaced = (requests: readonly StoredRequest[], next: StoredRequest): StoredRequest[] =>
  requests.map((request) => (request.id === next.id ? next : request));

/** A new waiting request at the end. Throws `REQUEST_LIMIT` when `max` are open already. */
export function addRequest(
  requests: readonly StoredRequest[],
  fresh: StoredRequest,
  slug: string,
  max = MAX_OPEN_REQUESTS,
): StoredRequest[] {
  if (openCount(requests) >= max) throw new KitvasError('REQUEST_LIMIT', { slug, max });
  return [...requests, fresh];
}

/** Every waiting request, now taken by Claude. */
export function takeWaiting(
  requests: readonly StoredRequest[],
  now: Date,
): { requests: StoredRequest[]; taken: StoredRequest[] } {
  const taken: StoredRequest[] = [];
  const next = requests.map((request) => {
    if (request.status !== 'waiting') return request;
    const moved: StoredRequest = { ...request, status: 'taken', takenAt: now.toISOString() };
    taken.push(moved);
    return moved;
  });
  return { requests: next, taken };
}

/** When a taken request waits again, in ms since the epoch; a time that does not read is due. */
export function expiresAt(request: StoredRequest): number {
  const at = request.takenAt === null ? Number.NaN : Date.parse(request.takenAt);
  return Number.isNaN(at) ? 0 : at + TAKEN_TIMEOUT_MS;
}

/** Taken requests with no answer for `TAKEN_TIMEOUT_MS` wait again: Claude's session ended. */
export function expireTaken(
  requests: readonly StoredRequest[],
  now: Date,
): { requests: StoredRequest[]; expired: number } {
  let expired = 0;
  const next = requests.map((request) => {
    if (request.status !== 'taken' || expiresAt(request) > now.getTime()) return request;
    expired += 1;
    const back: StoredRequest = { ...request, status: 'waiting', takenAt: null };
    return back;
  });
  return { requests: next, expired };
}

/** The earliest time a taken request waits again; `null` with none taken. */
export function nextExpiry(requests: readonly StoredRequest[]): number | null {
  const times = requests.filter((request) => request.status === 'taken').map(expiresAt);
  return times.length === 0 ? null : Math.min(...times);
}

/** Throws `REQUEST_NOT_TAKEN` unless Claude holds the request now. */
export function requireTaken(request: StoredRequest): void {
  if (request.status !== 'taken') throw new KitvasError('REQUEST_NOT_TAKEN', { id: request.id });
}

/**
 * Claude's answer to a taken request: variants or a closing word make it `answered`, a reason
 * makes it `failed`. `version` is the latest one now: the answer's element ids are its ids.
 * `stamps`: the elements as they are now, which the variants were made for.
 */
export function settleRequest(
  requests: readonly StoredRequest[],
  id: string,
  answer: RequestAnswer,
  at: { now: Date; version: number; stamps?: (string | null)[] },
): Moved {
  const current = findRequest(requests, id);
  requireTaken(current);
  const request: StoredRequest = {
    ...current,
    status: answer.kind === 'failed' ? 'failed' : 'answered',
    answer,
    answeredAt: at.now.toISOString(),
    answeredVersion: at.version,
    stamps: at.stamps ?? current.stamps,
  };
  return { requests: replaced(requests, request), request };
}

/** The person takes a request back, whatever it came to; a dropped one stays as it is. */
export function dropRequest(requests: readonly StoredRequest[], id: string): Moved {
  const current = findRequest(requests, id);
  if (current.status === 'dropped') return { requests: [...requests], request: current };
  const request: StoredRequest = { ...current, status: 'dropped' };
  return { requests: replaced(requests, request), request };
}
