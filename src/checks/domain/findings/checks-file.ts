// checks.json read back: the shape kitvas writes, checked before the studio shows any of it.

import { type Zod, z } from '../../../shared/index.ts';
import { CHECKS, type CheckName, type ChecksFile } from './finding.ts';

const count = z.number().int().min(0);

const FindingSchema = z.object({
  check: z.enum(CHECKS),
  rule: z.string(),
  severity: z.enum(['fix', 'review']),
  file: z.string().nullable(),
  line: count,
  column: count,
  element: z.string().nullable(),
  message: z.string(),
  hint: z.string(),
  states: z.array(z.string()),
  widths: z.array(z.number().int()),
});

const WaivedSchema = FindingSchema.extend({ reason: z.string() });

/** Not strict: a file written by a newer kitvas may carry more fields, which are dropped. */
export const ChecksFileSchema: Zod.ZodType<ChecksFile> = z.object({
  schemaVersion: z.literal(1),
  slug: z.string(),
  version: z.number().int().min(1),
  // A file from before a check existed lacks its key; it reads as skipped.
  checks: z
    .partialRecord(z.enum(CHECKS), z.enum(['ran', 'skipped']))
    .transform(
      (ran) =>
        Object.fromEntries(CHECKS.map((name) => [name, ran[name] ?? 'skipped'])) as Record<
          CheckName,
          'ran' | 'skipped'
        >,
    ),
  summary: z.object({ fix: count, review: count, waived: count.optional() }),
  browser: z.string().nullable(),
  notes: z.array(z.string()),
  shots: z.array(z.object({ state: z.string(), width: z.number().int(), file: z.string() })),
  findings: z.array(FindingSchema),
  waived: z.array(WaivedSchema).optional(),
  deep: z.boolean().optional(),
  rework: z.object({ fixed: count, left: count }).optional(),
});
