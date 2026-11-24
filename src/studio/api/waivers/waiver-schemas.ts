// Waivers (spec 4c, goal 6; plan 16, task E): a finding the person accepted on purpose, with a
// reason. Kept in `<draft>/waivers.json` and carried to later versions while the element and the
// rule still match.

import { ElementIdSchema } from '../../../edit/index.ts';
import { type Zod, z } from '../../../shared/index.ts';

export const MAX_REASON = 300;
export const MAX_WAIVERS = 500;

const Rule = z.string().regex(/^[a-z0-9]+\/[A-Za-z0-9-]{1,60}$/);

export const WaiverSchema = z.strictObject({
  rule: Rule,
  /** The element it is about; `null` for a finding with no element (a file or the whole page). */
  element: ElementIdSchema.nullable(),
  reason: z.string().trim().min(1).max(MAX_REASON),
  /** The version it was made on. */
  version: z.number().int().min(1),
  /** ISO date and time. */
  at: z.string().min(1).max(40),
});

/** The file `<draft>/waivers.json`. */
export const WaiversFileSchema = z.strictObject({
  schemaVersion: z.literal(1),
  waivers: z.array(WaiverSchema).max(MAX_WAIVERS),
});

/** `GET /api/v1/drafts/{slug}/waivers`. */
export const WaiversSchema = z.strictObject({ waivers: z.array(WaiverSchema) });

/** `POST /api/v1/drafts/{slug}/waivers`: accept a finding; the server adds the version and date. */
export const WaiverRequestSchema = z.strictObject({
  rule: Rule,
  element: ElementIdSchema.nullable(),
  reason: z.string().trim().min(1).max(MAX_REASON),
});

/** `POST /api/v1/drafts/{slug}/waivers/withdraw`: the waiver of this rule on this element goes. */
export const WaiverWithdrawSchema = z.strictObject({
  rule: Rule,
  element: ElementIdSchema.nullable(),
});

export type Waiver = Zod.infer<typeof WaiverSchema>;
export type WaiversFile = Zod.infer<typeof WaiversFileSchema>;
export type WaiverRequest = Zod.infer<typeof WaiverRequestSchema>;
