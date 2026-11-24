// Waivers (spec 4c, goal 6): a finding the person accepted on purpose, with a reason. They live in
// `<draft>/waivers.json`, beside `draft.json`, and carry to later versions while the element
// exists: an element's id changes through the rename log of each version (ADR 0052). Pure: no
// files here; `app/waivers.ts` reads and writes them.

import { type Zod, z } from '../../shared/index.ts';

export const WAIVERS_FILE = 'waivers.json';
export const MAX_WAIVER_REASON = 300;
export const MAX_WAIVERS = 500;

/** Copy of `ELEMENT_ID` in `src/edit/domain/ops.ts`: this module cannot import the edit module. */
const ELEMENT = /^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*:[A-Za-z0-9_.$-]+(?:\/[A-Za-z0-9_.$-]+)*$/;
/** A rule id as findings carry it: `<check>/<name>`. */
const RULE = /^[a-z0-9]+\/[A-Za-z0-9-]{1,60}$/;

export const DraftWaiverSchema = z.strictObject({
  rule: z.string().regex(RULE),
  /** The element as it was named on `version`; `null` for a finding with no element. */
  element: z.string().max(200).regex(ELEMENT).nullable(),
  reason: z.string().trim().min(1).max(MAX_WAIVER_REASON),
  /** The version it was made on. */
  version: z.number().int().min(1),
  /** ISO date and time; the same format as the rename log's `at`. */
  at: z.string().min(1).max(40),
});

const WaiversFileSchema = z.strictObject({
  schemaVersion: z.literal(1),
  waivers: z.array(DraftWaiverSchema).max(MAX_WAIVERS),
});

export type DraftWaiver = Zod.infer<typeof DraftWaiverSchema>;
/** What a waiver is about: the rule that fired and the element it fired on. */
export type WaiverKey = { rule: string; element: string | null };
/** The part of a rename step this module needs. */
export type RenameLike = { at: string; renames: Readonly<Record<string, string>> };

/** The stored waivers; a missing or broken file holds none, so a bad file never stops a check. */
export function parseWaivers(raw: unknown): DraftWaiver[] {
  const parsed = WaiversFileSchema.safeParse(raw);
  return parsed.success ? parsed.data.waivers : [];
}

export function waiversText(waivers: readonly DraftWaiver[]): string {
  return `${JSON.stringify({ schemaVersion: 1, waivers }, null, 2)}\n`;
}

export const sameKey = (a: WaiverKey, b: WaiverKey): boolean =>
  a.rule === b.rule && a.element === b.element;

/** The id after the steps, in order; an id no step names stays as it is. */
export function followRenames(element: string, steps: readonly RenameLike[]): string {
  let current = element;
  for (const step of steps) {
    const next = Object.hasOwn(step.renames, current) ? step.renames[current] : undefined;
    if (next !== undefined) current = next;
  }
  return current;
}

/**
 * The rename steps that came after a waiver, oldest first, up to `version`: the later steps of the
 * version it was made on (an open session goes on writing its log), and every step of the versions
 * after it. `stepsOf` reads one version's log.
 */
export function stepsAfter(
  waiver: DraftWaiver,
  version: number,
  stepsOf: (version: number) => readonly RenameLike[],
): RenameLike[] {
  const out: RenameLike[] = [];
  for (let at = waiver.version; at <= version; at += 1) {
    const steps = stepsOf(at);
    out.push(...(at === waiver.version ? steps.filter((step) => step.at > waiver.at) : steps));
  }
  return out;
}

/** The waiver with its element as `version` names it. */
export function carried(
  waiver: DraftWaiver,
  version: number,
  stepsOf: (version: number) => readonly RenameLike[],
): DraftWaiver {
  if (waiver.element === null || waiver.version > version) return waiver;
  return {
    ...waiver,
    element: followRenames(waiver.element, stepsAfter(waiver, version, stepsOf)),
  };
}
