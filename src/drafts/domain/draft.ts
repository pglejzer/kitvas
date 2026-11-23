// draft.json: what a draft is and which versions it has.

import { KitvasError, type Zod, z } from '../../shared/index.ts';
import { SLUG } from './names.ts';

const text = z.string().min(1);

export const DraftSchema = z.strictObject({
  schemaVersion: z.literal(1),
  slug: z.string().regex(SLUG),
  title: text,
  kind: z.literal('screen'),
  /** The kit the draft was started from. `hash` tells whether the kit changed since. */
  kit: z.strictObject({ id: text, version: text, hash: z.string().regex(/^[0-9a-f]{64}$/) }),
  createdAt: text,
  versions: z.array(z.strictObject({ number: z.number().int().min(1), createdAt: text })).min(1),
});

export type Draft = Zod.infer<typeof DraftSchema>;

export function parseDraft(raw: unknown, slug: string): Draft {
  const parsed = DraftSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  const first = parsed.error.issues[0];
  const where = first?.path.join('.') || 'draft.json';
  throw new KitvasError('DRAFT_INVALID', { slug, detail: `${where}: ${first?.message ?? ''}` });
}

export const latestVersion = (draft: Draft): number =>
  Math.max(...draft.versions.map((version) => version.number));

/** JSON the way kitvas writes its own files: two spaces and a final newline. */
export const serializeJson = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;
