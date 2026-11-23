// Shapes of API payloads and path parameters. Draft data uses the drafts module's own schemas.

import { SLUG, StatesSchema } from '../../drafts/index.ts';
import { z } from '../../shared/index.ts';
import { KIT_ID } from '../frame/frame-url.ts';
import { InboxItemSchema } from '../inbox/inbox.ts';
import { JobSchema } from '../jobs/job.ts';
import { PAGE_PATH } from '../security/open-links.ts';

export const NoParams = z.strictObject({});
export const SlugParams = z.strictObject({ slug: z.string().regex(SLUG) });
export const KitParams = z.strictObject({ id: z.string().regex(KIT_ID) });
export const VersionParams = z.strictObject({
  slug: z.string().regex(SLUG),
  number: z.string().regex(/^[1-9][0-9]{0,5}$/),
});

/** A change that carries no fields; unknown ones are still refused. */
export const EmptyBody = z.strictObject({});

export const StoppingSchema = z.strictObject({ stopping: z.literal(true) });

export const StatusSchema = z.strictObject({
  name: z.literal('kitvas'),
  version: z.string(),
  startedAt: z.string(),
  framePort: z.number().int(),
});

export const DraftItemSchema = z.strictObject({
  slug: z.string(),
  title: z.string().nullable(),
  kit: z.string().nullable(),
  version: z.number().int(),
  valid: z.boolean(),
});

export const DraftListSchema = z.strictObject({
  items: z.array(DraftItemSchema),
  nextCursor: z.string().nullable(),
});

export const VersionCreatedSchema = z.strictObject({
  slug: z.string(),
  version: z.number().int(),
});

export const VersionSchema = z.strictObject({
  slug: z.string(),
  number: z.number().int(),
  createdAt: z.string(),
  built: z.boolean(),
  states: StatesSchema,
});

export const OpenApiSchema = z.record(z.string(), z.unknown());

export const JobParams = z.strictObject({ id: z.uuid() });

export const JobListSchema = z.strictObject({
  items: z.array(JobSchema),
  nextCursor: z.string().nullable(),
});

/** One event of the events stream, for the API document. */
export const StudioEventSchema = z.discriminatedUnion('event', [
  z.strictObject({ event: z.literal('job'), id: z.string(), data: JobSchema }),
  z.strictObject({
    event: z.literal('inbox'),
    id: z.string(),
    data: z.strictObject({ pending: z.number().int() }),
  }),
  z.strictObject({ event: z.literal('reset'), id: z.string(), data: z.strictObject({}) }),
]);

export const InboxListSchema = z.strictObject({ items: z.array(InboxItemSchema) });

/** How long a take waits for a note when none waits: whole seconds, 0 to 600; absent is 0. */
export const TakeNotesSchema = z.strictObject({
  timeout: z.number().int().min(0).max(600).optional(),
});

export const LinkRequestSchema = z.strictObject({ path: z.string().regex(PAGE_PATH) });

/** One code on two addresses: `kitvas.localhost`, and `localhost` for a browser without it. */
export const LinkSchema = z.strictObject({
  url: z.string(),
  fallbackUrl: z.string(),
  expiresAt: z.string(),
});
