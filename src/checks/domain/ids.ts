// build/json/ids.json as the checks read it: where each element id is written.

import { z } from '../../shared/index.ts';

export type IdEntry = { id: string; file: string; line: number; column: number; tag: string };

const IdsSchema = z.object({
  ids: z.record(
    z.string(),
    z.object({ file: z.string(), line: z.number(), column: z.number(), tag: z.string() }),
  ),
});

/** The ids of a build, or none when the file is missing or not what a build writes. */
export function idEntries(raw: unknown): IdEntry[] {
  const parsed = IdsSchema.safeParse(raw);
  if (!parsed.success) return [];
  return Object.entries(parsed.data.ids).map(([id, at]) => ({ id, ...at }));
}

/** Where an element is written; no place when the id is null or not in the build. */
export function elementPlace(
  ids: IdEntry[],
  element: string | null,
): { file: string | null; line: number; column: number } {
  const entry = element === null ? undefined : ids.find((candidate) => candidate.id === element);
  return entry
    ? { file: entry.file, line: entry.line, column: entry.column }
    : { file: null, line: 0, column: 0 };
}
