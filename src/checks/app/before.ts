// The original of a rework in its draft (`before/`, ADR 0045): read and written through the draft
// store and checked against the C2 schemas both ways, plus the count of the original's problems
// that the capture writes and every check of a version compares with.

import { type DraftStore, loadDraft, serializeJson } from '../../drafts/index.ts';
import { KitvasError, type Zod } from '../../shared/index.ts';
import {
  BEFORE_DIR,
  type Before,
  type Inventory,
  InventorySchema,
  type Problems,
  ProblemsSchema,
  type Protected,
  ProtectedSchema,
  type SourceRecord,
  SourceRecordSchema,
} from '../domain/before.ts';
import type { RawFinding } from '../domain/finding.ts';
import { VISIT_RULES, type VisitInput, type VisitRule } from '../domain/rules/index.ts';

/** The files of `before/` that hold data, by the part of `Before` they hold. */
export const BEFORE_FILES = {
  source: `${BEFORE_DIR}/source.json`,
  inventory: `${BEFORE_DIR}/inventory.json`,
  problems: `${BEFORE_DIR}/problems.json`,
  protected: `${BEFORE_DIR}/protected.json`,
} as const;

/** Any of the parts; only the given ones are written. */
export type BeforePart = {
  source?: SourceRecord;
  inventory?: Inventory;
  /** null or absent: not written. */
  problems?: Problems | null;
  protected?: Protected | null;
};

type SchemaIssue = { path: readonly PropertyKey[]; message: string };

/** DRAFT_INVALID naming the file and the first place in it that is wrong. */
function broken(slug: string, file: string, issues: readonly SchemaIssue[]): KitvasError {
  const first = issues[0];
  const where = first?.path.map(String).join('.') || 'file';
  return new KitvasError('DRAFT_INVALID', {
    slug,
    detail: `${file} ${where}: ${first?.message ?? ''}`,
  });
}

/** One file of `before/`; null when it is missing. Not JSON, or not the shape, is DRAFT_INVALID. */
function readPart<T>(
  store: DraftStore,
  slug: string,
  file: string,
  schema: Zod.ZodType<T>,
): T | null {
  const raw = store.readJson(slug, file);
  if (raw === undefined) return null;
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw broken(slug, file, parsed.error.issues);
  return parsed.data;
}

/**
 * The draft's `before/`, or null when the draft has none. `source.json` must be there once the
 * folder is; a missing inventory reads as empty (the skill writes it for images), a missing
 * problems or protected list as null.
 */
export function readBefore(store: DraftStore, slug: string): Before | null {
  if (!store.exists(slug, BEFORE_DIR)) return null;
  const source = readPart(store, slug, BEFORE_FILES.source, SourceRecordSchema);
  if (source === null) {
    throw new KitvasError('DRAFT_INVALID', { slug, detail: BEFORE_FILES.source });
  }
  return {
    source,
    inventory: readPart(store, slug, BEFORE_FILES.inventory, InventorySchema) ?? { items: [] },
    problems: readPart(store, slug, BEFORE_FILES.problems, ProblemsSchema),
    protected: readPart(store, slug, BEFORE_FILES.protected, ProtectedSchema),
  };
}

/**
 * Writes the given parts of `before/`. Every part is checked first, so a part of the wrong shape is
 * DRAFT_INVALID and nothing is written.
 */
export function writeBefore(store: DraftStore, slug: string, part: BeforePart): void {
  const texts: [string, string][] = [];
  const add = <T>(file: string, schema: Zod.ZodType<T>, value: unknown): void => {
    if (value === undefined || value === null) return;
    const parsed = schema.safeParse(value);
    if (!parsed.success) throw broken(slug, file, parsed.error.issues);
    texts.push([file, serializeJson(parsed.data)]);
  };
  add(BEFORE_FILES.source, SourceRecordSchema, part.source);
  add(BEFORE_FILES.inventory, InventorySchema, part.inventory);
  add(BEFORE_FILES.problems, ProblemsSchema, part.problems);
  add(BEFORE_FILES.protected, ProtectedSchema, part.protected);
  for (const [file, text] of texts) store.writeText(slug, file, text);
}

/** The `before/` of a rework draft. Another kind is DRAFT_KIND; a rework without one is DRAFT_INVALID. */
export function reworkBefore(store: DraftStore, slug: string): Before {
  const draft = loadDraft(store, slug);
  if (draft.kind !== 'rework') {
    throw new KitvasError('DRAFT_KIND', { slug, kind: draft.kind, needed: 'rework' });
  }
  const before = readBefore(store, slug);
  if (before === null) {
    throw new KitvasError('DRAFT_INVALID', { slug, detail: BEFORE_FILES.source });
  }
  return before;
}

/**
 * Every visit rule's findings on the given visits, with no cap: the original's problems at capture,
 * and the version's own count that `ux/before-problems` compares with them.
 */
export function uncappedFindings(
  visits: readonly VisitInput[],
  rules: readonly VisitRule[] = VISIT_RULES,
): RawFinding[] {
  const findings: RawFinding[] = [];
  for (const visit of visits) {
    for (const rule of rules) findings.push(...rule.run(visit));
  }
  return findings;
}

/** The problems list: the findings and how many each rule gave. */
export function problemsOf(findings: RawFinding[]): Problems {
  const counts: Record<string, number> = {};
  for (const finding of findings) counts[finding.rule] = (counts[finding.rule] ?? 0) + 1;
  return { counts, findings };
}
