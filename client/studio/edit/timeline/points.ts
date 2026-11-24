// The rules of the Versions list (spec 4d, goal 5; plan 17, task D; plan 18, task B), pure so they
// are tested without a DOM: the points and their rows, the marks of the selected element's
// changes, which versions are new, whether Bring back has anything to bring, and the words of its
// request to Claude.

import type { Zod } from '../../../../src/shared/index.ts';
import type {
  ElementHistorySchema,
  RestorePreviewSchema,
} from '../../../../src/studio/api/history/history-schemas.ts';

export type ElementHistory = Zod.infer<typeof ElementHistorySchema>;
export type ElementStep = ElementHistory['steps'][number];
export type RestorePreview = Zod.infer<typeof RestorePreviewSchema>;

/**
 * What a point says of the selected element: it changed in that version (`changed`), it changed
 * there as far as a best-effort match can tell (`unsure`), or it was not there yet (`absent`).
 */
export type Mark = 'none' | 'changed' | 'unsure' | 'absent';

export type Point = {
  version: number;
  /** The latest version: what the editor edits. */
  now: boolean;
  /** The version the cards show. */
  shown: boolean;
  mark: Mark;
};

/** The request's text is cut to what the requests API takes (`MAX_REQUEST_TEXT`). */
export const MAX_ASK = 1_000;

export function markOf(step: ElementStep | undefined): Mark {
  if (step === undefined) return 'none';
  if (step.id === null) return 'absent';
  if (!step.changed) return 'none';
  return step.unsure ? 'unsure' : 'changed';
}

/**
 * One point per version, oldest first; the latest one is "now". `viewing`: the older version the
 * cards show, `null` for now. `steps`: the selected element's history, `null` with none selected.
 */
export function pointsOf(
  versions: readonly number[],
  viewing: number | null,
  steps: readonly ElementStep[] | null,
): Point[] {
  const sorted = [...new Set(versions)].sort((a, b) => a - b);
  const latest = sorted[sorted.length - 1];
  return sorted.map((version) => {
    const now = version === latest;
    return {
      version,
      now,
      shown: viewing === null ? now : version === viewing,
      mark: steps === null ? 'none' : markOf(steps.find((step) => step.version === version)),
    };
  });
}

/**
 * The rows of the Versions list: "Now" first, then each older version, newest first, each with
 * the mark of the selected element's change in it. Same arguments as `pointsOf`.
 */
export function versionRows(
  versions: readonly number[],
  viewing: number | null,
  steps: readonly ElementStep[] | null,
): Point[] {
  return pointsOf(versions, viewing, steps).reverse();
}

/**
 * The versions of `read` that `known` did not have: a version saved while the page is open, which
 * slides into the list. Nothing is new on the first read (`known` empty), or the whole list would.
 */
export function newVersions(known: readonly number[], read: readonly number[]): number[] {
  if (known.length === 0) return [];
  const had = new Set(known);
  return read.filter((version) => !had.has(version));
}

/** The element's id in `version`; `null` when it was not there or nothing is known of it. */
export function idIn(steps: readonly ElementStep[] | null, version: number | null): string | null {
  if (steps === null || version === null) return null;
  return steps.find((step) => step.version === version)?.id ?? null;
}

/**
 * The request to Claude when kitvas cannot bring the element back itself. Written for Claude, in
 * English, so it is a constant here and not a page text (as the words of `history/ask.ts`).
 */
export function askWords(id: string, version: number, preview: RestorePreview): string {
  const lines = [
    `Please bring the element ${id} back as it was in version ${version} of this draft.`,
    `Its file is ${preview.file}.`,
    `The studio could not write it itself: the current file lacks ${preview.missing.join(', ')}.`,
    'Add what is missing or adapt the old source, and keep to the kit.',
  ];
  return lines.join(' ').slice(0, MAX_ASK);
}
