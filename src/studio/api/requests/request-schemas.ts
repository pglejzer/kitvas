// Requests to Claude from the editor (spec 4d, goals 1 and 2; plan 17): the shapes the studio
// API takes and gives. A request is kept in `<draft>/requests.json` (`src/studio/requests/`);
// Claude takes it through `kitvas inbox`, reads it with `kitvas request show` and answers with
// variants (`kitvas request answer`), a closing word (`done`) or a reason (`fail`). The lists and
// limits are in `request-limits.ts`, re-exported here.

import {
  EditOpSchema,
  ELEMENT_ID,
  PROP_NAME,
  PropValueSchema,
  STYLE_PROPERTIES,
  StyleContextSchema,
  StyleValueSchema,
  UTILITY,
} from '../../../edit/index.ts';
import { type Zod, z } from '../../../shared/index.ts';
import { InspectSchema } from '../edit/edit-schemas.ts';
import {
  LISTENING_STATES,
  MAX_REQUEST_ELEMENTS,
  MAX_REQUEST_TEXT,
  MAX_REQUEST_WORDS,
  MAX_VARIANT_CHANGES,
  MAX_VARIANT_LABEL,
  MAX_VARIANTS,
  REQUEST_KINDS,
  REQUEST_STATUSES,
} from './request-limits.ts';

export * from './request-limits.ts';

const Element = z.string().max(200).regex(ELEMENT_ID);
const Id = z.uuid();

/**
 * One change of a variant, in the small form Claude writes (spec 4d, goal 2). The studio turns it
 * into ops with the panel's own code, against the elements as they are when it is previewed.
 */
export const VariantChangeSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('style'),
    id: Element,
    property: z.enum(STYLE_PROPERTIES),
    value: StyleValueSchema,
  }),
  z.strictObject({
    kind: z.literal('prop'),
    id: Element,
    name: z.string().regex(PROP_NAME),
    value: PropValueSchema,
  }),
  z.strictObject({ kind: z.literal('text'), id: Element, value: z.string().max(2_000) }),
  /** Tailwind drafts: a utility added (`before: null`), swapped or removed (`value: null`). */
  z.strictObject({
    kind: z.literal('utility'),
    id: Element,
    value: z.string().regex(UTILITY).nullable(),
    before: z.string().regex(UTILITY).nullable(),
  }),
]);
export type VariantChange = Zod.infer<typeof VariantChangeSchema>;

export const VariantSchema = z.strictObject({
  label: z.string().trim().min(1).max(MAX_VARIANT_LABEL),
  changes: z.array(VariantChangeSchema).min(1).max(MAX_VARIANT_CHANGES),
});
export type Variant = Zod.infer<typeof VariantSchema>;

/** A new request from the editor. `ops`: the refused edit of an `ask` (4a to 4c). */
export const NewRequestSchema = z.strictObject({
  kind: z.enum(REQUEST_KINDS),
  elements: z.array(Element).max(MAX_REQUEST_ELEMENTS),
  context: StyleContextSchema,
  text: z.string().trim().max(MAX_REQUEST_TEXT),
  ops: z.array(EditOpSchema).max(MAX_VARIANT_CHANGES).optional(),
  /** The note a `note` request carries (goal 3). */
  note: Id.nullable().optional(),
});
export type NewRequest = Zod.infer<typeof NewRequestSchema>;

/** What a request came to. */
export const RequestAnswerSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('variants'), variants: z.array(VariantSchema).min(1) }),
  z.strictObject({ kind: z.literal('done'), message: z.string().max(MAX_REQUEST_WORDS) }),
  z.strictObject({ kind: z.literal('failed'), reason: z.string().max(MAX_REQUEST_WORDS) }),
]);
export type RequestAnswer = Zod.infer<typeof RequestAnswerSchema>;

/** A request as the editor shows it. `stale`: an element changed since it was made. */
export const RequestViewSchema = z.strictObject({
  id: Id,
  kind: z.enum(REQUEST_KINDS),
  elements: z.array(Element),
  context: StyleContextSchema,
  text: z.string(),
  version: z.number().int().min(1),
  at: z.string(),
  status: z.enum(REQUEST_STATUSES),
  note: Id.nullable(),
  stale: z.boolean(),
  answer: RequestAnswerSchema.nullable(),
});
export type RequestView = Zod.infer<typeof RequestViewSchema>;

/**
 * Whether a Claude Code session takes the requests now (spec 4d, goal 1). The studio has one
 * session: `GET /api/v1/listening` answers it, and the `listening` event carries each new one.
 */
export const ListeningSchema = z.strictObject({
  state: z.enum(LISTENING_STATES),
  /** When the state began, ISO; `null` when no session was seen since the studio started. */
  since: z.string().nullable(),
});
export type Listening = Zod.infer<typeof ListeningSchema>;

/** GET `/api/v1/drafts/{slug}/requests`: the draft's requests, newest first, and the session. */
export const RequestsSchema = z.strictObject({
  requests: z.array(RequestViewSchema),
  listening: ListeningSchema,
});
export type Requests = Zod.infer<typeof RequestsSchema>;

/** What `kitvas request show` prints: everything Claude needs to answer one request. */
export const RequestContextSchema = z.strictObject({
  request: RequestViewSchema,
  slug: z.string(),
  format: z.enum(['scss', 'tailwind']),
  /** Each element of the request as the editor's inspect sees it now; a gone one is left out. */
  elements: z.array(InspectSchema),
  /** Locked element ids of the draft (goal 4): never to be changed. */
  locked: z.array(Element),
  /** The refused edit of an `ask`, as the editor sent it (ids of `request.version`); else empty. */
  ops: z.array(EditOpSchema),
});
export type RequestContext = Zod.infer<typeof RequestContextSchema>;

/** POST `/api/v1/requests/{id}/answer`, `/done` and `/fail` bodies. */
export const VariantsAnswerSchema = z.strictObject({
  variants: z.array(VariantSchema).min(1).max(MAX_VARIANTS),
});
export const DoneSchema = z.strictObject({ message: z.string().trim().max(MAX_REQUEST_WORDS) });
export const FailSchema = z.strictObject({
  reason: z.string().trim().min(1).max(MAX_REQUEST_WORDS),
});
