// Origins (C9): where each component of a `code` kit came from, as two hashes kept in
// `<kit>/origins.json`. Pure rules; the use case reads the files and does the hashing.

import { type Zod, z } from '../../shared/index.ts';

export const ORIGINS_FILE = 'origins.json';

export const OriginsSchema = z.strictObject({
  schemaVersion: z.literal(1),
  components: z.record(z.string(), z.strictObject({ project: z.string(), copy: z.string() })),
});

export type Origins = Zod.infer<typeof OriginsSchema>;
export type Origin = Origins['components'][string];

/** Why a component is out of date: its project files differ now, or one of them is missing. */
export type OutdatedReason = 'changed' | 'gone';
export type OutdatedComponent = { name: string; reason: OutdatedReason };

/** What the project and the copy hash to now; `project` is `undefined` when a project file is missing. */
export type NowHashes = { name: string; project: string | undefined; copy: string };

export const emptyOrigins = (): Origins => ({ schemaVersion: 1, components: {} });

/** The records in a file's text; none when it is missing, not JSON or not this shape. */
export function parseOrigins(text: string | undefined): Origins {
  if (text === undefined) return emptyOrigins();
  try {
    const parsed = OriginsSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : emptyOrigins();
  } catch {
    return emptyOrigins();
  }
}

/** A file's text with every line end as `\n`, so a checkout with other line ends hashes the same. */
export const normalizeLineEnds = (text: string): string => text.replace(/\r\n?/g, '\n');

/**
 * The records after a verify: a component is recorded when it has no record, when its copy differs
 * from the record, or when its name is in `current`; any other record stays; a record of a component
 * the kit no longer has is dropped. A component whose project files cannot be read is not recorded.
 * Components are written in the kit's order.
 */
export function nextOrigins(
  before: Origins,
  now: readonly NowHashes[],
  current: readonly string[],
): Origins {
  const components: Origins['components'] = {};
  for (const item of now) {
    const known = before.components[item.name];
    const rewrite = known === undefined || known.copy !== item.copy || current.includes(item.name);
    if (rewrite && item.project !== undefined) {
      components[item.name] = { project: item.project, copy: item.copy };
    } else if (known !== undefined) {
      components[item.name] = known;
    }
  }
  return { schemaVersion: 1, components };
}

/** The recorded components whose project files differ now, in the kit's order. */
export function outdatedOf(before: Origins, now: readonly NowHashes[]): OutdatedComponent[] {
  const list: OutdatedComponent[] = [];
  for (const item of now) {
    const known = before.components[item.name];
    if (known === undefined) continue;
    if (item.project === undefined) list.push({ name: item.name, reason: 'gone' });
    else if (item.project !== known.project) list.push({ name: item.name, reason: 'changed' });
  }
  return list;
}
