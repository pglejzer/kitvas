// What `kitvas kit verify` found, and the file it leaves in the kit's catalog folder for the studio.

import { type Zod, z } from '../../../shared/index.ts';

export const VERIFY_STEPS = [
  'schema',
  'imports',
  'types',
  'render',
  'tokens',
  'look',
  'original',
] as const;
export type VerifyStep = (typeof VERIFY_STEPS)[number];
export type StepState = 'passed' | 'failed' | 'skipped';

/** Inside the catalog folder (`catalogDir`). */
export const VERIFY_FILE = 'verify.json';

const IssueSchema = z.strictObject({
  step: z.enum(VERIFY_STEPS),
  /** Where in kit.json, like a KitIssue path: `components.2.props.0`, `tokens.color.ink`. */
  path: z.string(),
  /** Message key (`kitIssue.*`) and its parameters; the reader translates. */
  key: z.string(),
  params: z.record(z.string(), z.union([z.string(), z.number()])),
});

const state = z.enum(['passed', 'failed', 'skipped']);

/** How close one referenced example looks to its reference (see look-score.ts). */
const LookEntrySchema = z.strictObject({
  /** The example, `Button.1`. */
  key: z.string(),
  score: z.number(),
  size: z.number(),
  colour: z.number(),
  structure: z.number(),
});

/** One example compared with its drawn original at one width (step `original`). */
const OriginalEntrySchema = z.strictObject({
  key: z.string(),
  width: z.number(),
  frames: z.number(),
  differences: z.number(),
  score: z.number(),
});

/** How a component of a `code` kit was compared: `app` by a picture, `code` by numbers, else read. */
const ComparedEntrySchema = z.strictObject({
  component: z.string(),
  level: z.enum(['app', 'code', 'read']),
  why: z.enum(['none', 'notDrawn', 'partial']).optional(),
});

export const VerifyFileSchema = z.strictObject({
  /** 2 since the `look` step, 3 since `original`; older files are read as before. */
  schemaVersion: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  kit: z.string(),
  /** The kit's hash (`LoadedKit.hash`) when it was verified; another hash means "verify again". */
  hash: z.string(),
  /** ISO time of the run. */
  at: z.string(),
  valid: z.boolean(),
  steps: z.strictObject({
    schema: state,
    imports: state,
    types: state,
    render: state,
    tokens: state,
    look: state.optional(),
    original: state.optional(),
  }),
  /** One entry per example with a reference that was captured and scored. */
  look: z.array(LookEntrySchema).optional(),
  /** `code` kits: one entry per example and width compared with its original. */
  originals: z.array(OriginalEntrySchema).optional(),
  /** `code` kits: how each component was compared. */
  compared: z.array(ComparedEntrySchema).optional(),
  issues: z.array(IssueSchema),
  /** Notes such as "render and tokens need a browser", as message keys. */
  notes: z.array(z.string()),
});

export type VerifyIssue = Zod.infer<typeof IssueSchema>;
export type LookEntry = Zod.infer<typeof LookEntrySchema>;
export type OriginalEntry = Zod.infer<typeof OriginalEntrySchema>;
export type ComparedEntry = Zod.infer<typeof ComparedEntrySchema>;
export type VerifyFile = Zod.infer<typeof VerifyFileSchema>;

/** The file's content; `undefined` when missing, not JSON or not of this shape. */
export function readVerifyFile(text: string | undefined): VerifyFile | undefined {
  if (text === undefined) return undefined;
  try {
    const parsed = VerifyFileSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}
