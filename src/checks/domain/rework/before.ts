// The original of a rework (`before/`) and the example of a craft (`reference/`): what was
// captured, the inventory, the original's problems and the protected list (ADR 0045).
// The folders sit next to the version folders of the draft, not inside a version.

import { type Zod, z } from '../../../shared/index.ts';
import { CHECKS } from '../findings/finding.ts';
import { INVENTORY_KINDS, InventoryItemSchema } from './inventory.ts';

export const BEFORE_DIR = 'before';
export const REFERENCE_DIR = 'reference';

export const SourceRecordSchema = z.strictObject({
  schemaVersion: z.literal(1),
  source: z.enum(['url', 'image', 'figma']),
  url: z.string().nullable(),
  /** File names under `images/`, in the order given. */
  files: z.array(z.string()),
  capturedAt: z.string(),
  widths: z.array(z.number().int()),
  /** True when a live page was measured, so `problems.json` exists. */
  measured: z.boolean(),
});
export type SourceRecord = Zod.infer<typeof SourceRecordSchema>;

export const InventorySchema = z.strictObject({ items: z.array(InventoryItemSchema) });
export type Inventory = Zod.infer<typeof InventorySchema>;

const MessageSchema = z.strictObject({
  key: z.string(),
  params: z.record(z.string(), z.union([z.string(), z.number()])),
});

const RawFindingSchema = z.strictObject({
  check: z.enum(CHECKS),
  rule: z.string(),
  severity: z.enum(['fix', 'review']),
  file: z.string().nullable(),
  line: z.number().int(),
  column: z.number().int(),
  element: z.string().nullable(),
  message: MessageSchema,
  hint: MessageSchema,
  states: z.array(z.string()),
  widths: z.array(z.number().int()),
});

/** Every visit rule's findings on the original at both widths, before any cap, and their counts by rule. */
export const ProblemsSchema = z.strictObject({
  counts: z.record(z.string(), z.number().int().min(0)),
  findings: z.array(RawFindingSchema),
});
export type Problems = Zod.infer<typeof ProblemsSchema>;

export const ProtectedItemSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9-]+$/),
  kind: z.enum(INVENTORY_KINDS),
  /** The text, name, label or price to find in every version. */
  find: z.string().min(1),
  note: z.string().optional(),
});
export type ProtectedItem = Zod.infer<typeof ProtectedItemSchema>;

/** `confirmed` is set once the person agreed to the list; only then is it checked. */
export const ProtectedSchema = z.strictObject({
  confirmed: z.boolean(),
  items: z.array(ProtectedItemSchema),
});
export type Protected = Zod.infer<typeof ProtectedSchema>;

export type Before = {
  source: SourceRecord;
  inventory: Inventory;
  problems: Problems | null;
  protected: Protected | null;
};
