// Requests to Claude kept on disk (spec 4d, goal 1; plan 17, task A): `<draft>/requests.json`,
// beside `draft.json`, so none is lost while no Claude session listens or the studio restarts.
// The studio is the file's only writer; the CLI goes through the studio's API. A request keeps
// what its view needs, when Claude took it, and a stamp of each element as it was when the
// request was made (`stamps.ts`), so an answer made before the person changed one shows as
// out of date.

import type { DraftStore } from '../../drafts/index.ts';
import { EditOpSchema, ELEMENT_ID, StyleContextSchema } from '../../edit/index.ts';
import { type Zod, z } from '../../shared/index.ts';
import {
  MAX_REQUEST_ELEMENTS,
  MAX_REQUEST_TEXT,
  MAX_VARIANT_CHANGES,
  REQUEST_KINDS,
  REQUEST_STATUSES,
  RequestAnswerSchema,
} from '../api/requests/request-schemas.ts';

export const REQUESTS_FILE = 'requests.json';
/** Closed requests (answered, failed, dropped) kept beside the open ones; the oldest go first. */
export const MAX_CLOSED_REQUESTS = 100;
/** A stamp: sha256 hex of an element as the editor reads it. */
export const STAMP = /^[0-9a-f]{64}$/;

const Element = z.string().max(200).regex(ELEMENT_ID);
const Time = z.string().min(1).max(40);

export const StoredRequestSchema = z.strictObject({
  id: z.uuid(),
  kind: z.enum(REQUEST_KINDS),
  /** The elements as `version` named them when the request was made. */
  elements: z.array(Element).max(MAX_REQUEST_ELEMENTS),
  /** One stamp per element, when the request was made; `null`: it could not be read then. */
  stamps: z.array(z.string().regex(STAMP).nullable()).max(MAX_REQUEST_ELEMENTS),
  context: StyleContextSchema,
  text: z.string().max(MAX_REQUEST_TEXT),
  /** The refused edit of an `ask` (4a to 4c); empty for the other kinds. */
  ops: z.array(EditOpSchema).max(MAX_VARIANT_CHANGES),
  /** The note a `note` request carries (goal 3). */
  note: z.uuid().nullable(),
  /** The latest version when the request was made. */
  version: z.number().int().min(1),
  at: Time,
  status: z.enum(REQUEST_STATUSES),
  /** When a take handed it to Claude; `null` while it waits. */
  takenAt: Time.nullable(),
  answer: RequestAnswerSchema.nullable(),
  /** When the answer came, and the version whose element ids the answer uses. */
  answeredAt: Time.nullable(),
  answeredVersion: z.number().int().min(1).nullable(),
});
export type StoredRequest = Zod.infer<typeof StoredRequestSchema>;

/** The file's frame; each request is read on its own, so one broken entry costs only itself. */
const RequestsFileSchema = z.strictObject({
  schemaVersion: z.literal(1),
  requests: z.array(z.unknown()),
});

export const isOpen = (request: StoredRequest): boolean =>
  request.status === 'waiting' || request.status === 'taken';

/** The stored requests, oldest first. A file that is missing or does not read holds none. */
export function readRequests(drafts: DraftStore, slug: string): StoredRequest[] {
  let raw: unknown;
  try {
    raw = drafts.readJson(slug, REQUESTS_FILE);
  } catch {
    // Not JSON: the requests only help the editor, so a broken file never stops the studio.
    return [];
  }
  const file = RequestsFileSchema.safeParse(raw);
  if (!file.success) return [];
  return file.data.requests.flatMap((entry) => {
    const parsed = StoredRequestSchema.safeParse(entry);
    return parsed.success ? [parsed.data] : [];
  });
}

/** Every open request, and the newest `MAX_CLOSED_REQUESTS` closed ones, in their order. */
export function pruneRequests(requests: readonly StoredRequest[]): StoredRequest[] {
  const closed = requests.filter((request) => !isOpen(request));
  const dropped = new Set(
    closed.slice(0, Math.max(0, closed.length - MAX_CLOSED_REQUESTS)).map((request) => request.id),
  );
  return requests.filter((request) => !dropped.has(request.id));
}

export function requestsText(requests: readonly StoredRequest[]): string {
  return `${JSON.stringify({ schemaVersion: 1, requests: pruneRequests(requests) }, null, 2)}\n`;
}

/** Written whole or not at all, as the other files a write of the studio changes. */
export function writeRequests(
  drafts: DraftStore,
  slug: string,
  requests: readonly StoredRequest[],
): void {
  drafts.replaceAll(slug, [{ relPath: REQUESTS_FILE, text: requestsText(requests) }]);
}
