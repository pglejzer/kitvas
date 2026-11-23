// draft.json: what a draft is and which versions it has.

import { KitvasError, type Zod, z } from '../../shared/index.ts';
import { SLUG } from './names.ts';

const text = z.string().min(1);

/** `screen`: compose from a brief. `rework`: a better version of a page (ADR 0045). `craft`: a component, icon or logo in sketches. */
export const DRAFT_KINDS = ['screen', 'rework', 'craft'] as const;
export type DraftKind = (typeof DRAFT_KINDS)[number];
export const CRAFT_SUBJECTS = ['component', 'icon', 'logo'] as const;
export type CraftSubject = (typeof CRAFT_SUBJECTS)[number];
export const SKETCHES = ['A', 'B', 'C'] as const;
export type Sketch = (typeof SKETCHES)[number];
/** Where a rework's original came from. */
export const REWORK_SOURCES = ['url', 'image', 'figma'] as const;

export const DraftSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    slug: z.string().regex(SLUG),
    title: text,
    kind: z.enum(DRAFT_KINDS),
    /** The kit the draft was started from. `hash` tells whether the kit changed since. */
    kit: z.strictObject({ id: text, version: text, hash: z.string().regex(/^[0-9a-f]{64}$/) }),
    createdAt: text,
    versions: z.array(z.strictObject({ number: z.number().int().min(1), createdAt: text })).min(1),
    rework: z.strictObject({ source: z.enum(REWORK_SOURCES) }).optional(),
    craft: z
      .strictObject({
        subject: z.enum(CRAFT_SUBJECTS),
        /** PascalCase: the name the final gets in the kit. */
        name: z.string().regex(/^[A-Z][A-Za-z0-9]*$/),
        description: text,
        picked: z.enum(SKETCHES).nullable(),
      })
      .optional(),
    /**
     * The open editing session (spec 4a, decision 2): edits go into `version`. It is open only
     * while `version` is the latest; a newer version ends it.
     */
    edit: z.strictObject({ version: z.number().int().min(1), startedAt: text }).optional(),
  })
  .superRefine((draft, issues) => {
    // Each kind carries its own block and no other.
    const wrong =
      (draft.kind === 'rework') !== (draft.rework !== undefined) ||
      (draft.kind === 'craft') !== (draft.craft !== undefined);
    if (wrong) issues.addIssue({ code: 'custom', path: ['kind'], message: `${draft.kind} block` });
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
