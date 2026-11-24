// A deleted draft (ADR 0064): its whole folder moves to `.kitvas/trash/<slug>~<stamp>/`, and a
// small `deleted.json` beside its `draft.json` says what it was and when it went. Pure: no files
// here; `app/trash.ts` moves the folders.

import { type Zod, z } from '../../shared/index.ts';
import { SLUG } from './names.ts';

export const TRASH_FILE = 'deleted.json';

/** `<slug>~<stamp>`: a slug never holds `~`, so the name reads back in one way. */
const ENTRY = /^([a-z0-9][a-z0-9-]{0,62})~(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(\d{3})Z$/;

export const DeletedFileSchema = z.strictObject({
  schemaVersion: z.literal(1),
  slug: z.string().regex(SLUG),
  title: z.string().min(1),
  /** ISO date and time of the delete. */
  deletedAt: z.string().min(1).max(40),
});

export type DeletedFile = Zod.infer<typeof DeletedFileSchema>;

/** The time as a file name part that Windows accepts and that sorts by time: `20261124T101530123Z`. */
export function trashStamp(at: Date): string {
  return at.toISOString().replace(/[-:]/g, '').replace('.', '');
}

/** The folder name of a draft deleted at `at`. */
export const trashEntryName = (slug: string, at: Date): string => `${slug}~${trashStamp(at)}`;

export type TrashEntry = { entry: string; slug: string; deletedAt: string };

/** What a trash folder name says, or `undefined` for a name kitvas did not make. */
export function parseTrashEntry(name: string): TrashEntry | undefined {
  const found = ENTRY.exec(name);
  if (!found) return undefined;
  const [, slug, year, month, day, hour, minute, second, millis] = found;
  if (slug === undefined) return undefined;
  const deletedAt = `${year}-${month}-${day}T${hour}:${minute}:${second}.${millis}Z`;
  const date = new Date(deletedAt);
  // 30 February and the like do not read back to the same text.
  if (Number.isNaN(date.getTime()) || date.toISOString() !== deletedAt) return undefined;
  return { entry: name, slug, deletedAt };
}

/** The stored `deleted.json`; `undefined` for a missing or broken file. */
export function parseDeletedFile(raw: unknown): DeletedFile | undefined {
  const parsed = DeletedFileSchema.safeParse(raw);
  return parsed.success ? parsed.data : undefined;
}
