// The Changes pane's decisions as plain data (plan 18f, task 3): what an entry shows as chips
// (`size  md -> lg`, the old value struck), the filter All | You | Claude with its counts, how long
// ago an entry was made, and which icon an entry wears. No DOM and no text for people: the pane
// draws them and words what has no name of its own.

import type { IconName } from '../../../../src/studio/pages/icons/paths.ts';
import type { ChangeEntry } from '../store.ts';
import { type ChangeChip, MAX_CHIP_TEXT, type StepEntry } from './chips.ts';

/** One chip of a change line: the thing, its old value (`null`: there was none) and the new one. */
export type EntryChip = { label: string; before: string | null; after: string };

/** The three views of the list. */
export type ChangeFilter = 'all' | 'person' | 'claude';

export const CHANGE_FILTERS: readonly ChangeFilter[] = ['all', 'person', 'claude'];

/** A value longer than `MAX_CHIP_TEXT` (24) is cut short, with an ellipsis. */
export const cut = (value: string): string =>
  value.length <= MAX_CHIP_TEXT ? value : `${value.slice(0, MAX_CHIP_TEXT - 1)}…`;

/** The chips of a gesture as the pane shows them; a removed value is `''`, which the view words. */
export function entryChips(
  chips: readonly ChangeChip[],
  nameOf: (chip: ChangeChip) => string = (chip) => chip.name,
): EntryChip[] {
  return chips.map((chip) => ({
    label: nameOf(chip),
    before: chip.before === null ? null : cut(chip.before),
    after: chip.after === null ? '' : cut(chip.after),
  }));
}

/**
 * What one change line shows: its chips, else the one value it recorded (`before` and `after`
 * under the line's own label), else nothing. A line with no old value shows the new one only.
 */
export function changeChips(entry: StepEntry, nameOf?: (chip: ChangeChip) => string): EntryChip[] {
  if (entry.chips !== undefined && entry.chips.length > 0) return entryChips(entry.chips, nameOf);
  if (entry.after === undefined) return [];
  const before = entry.before === undefined ? null : cut(entry.before);
  return [{ label: entry.label, before, after: cut(entry.after) }];
}

/**
 * The `before` and `after` a change line records: the values of its one chip. A step with several
 * chips, or one that only removed a value, records none (its chips say it).
 */
export function valuesOf(chips: readonly ChangeChip[]): { before?: string; after?: string } {
  const [only] = chips;
  if (chips.length !== 1 || only === undefined || only.after === null) return {};
  return only.before === null ? { after: only.after } : { before: only.before, after: only.after };
}

/** The lines the filter shows; the order is kept. */
export function filterChanges<T extends ChangeEntry>(entries: readonly T[], by: ChangeFilter): T[] {
  return by === 'all' ? [...entries] : entries.filter((entry) => entry.by === by);
}

/** How many lines each filter shows. */
export function countChanges(entries: readonly ChangeEntry[]): Record<ChangeFilter, number> {
  const claude = entries.filter((entry) => entry.by === 'claude').length;
  return { all: entries.length, person: entries.length - claude, claude };
}

export type Ago = { unit: 'now' | 'min' | 'hour' | 'day'; n: number };

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** How long before `now` something was made: "now", then minutes, hours and days. */
export function agoOf(at: number, now: number): Ago {
  const span = Math.max(0, now - at);
  if (span < MINUTE) return { unit: 'now', n: 0 };
  if (span < HOUR) return { unit: 'min', n: Math.floor(span / MINUTE) };
  if (span < DAY) return { unit: 'hour', n: Math.floor(span / HOUR) };
  return { unit: 'day', n: Math.floor(span / DAY) };
}

/** The icon of a line's element: a text for a text change, a section for a whole file. */
export function iconOfEntry(entry: StepEntry): IconName {
  if (entry.id === null) return 'section';
  const chips = entry.chips ?? [];
  return chips.length > 0 && chips.every((chip) => chip.kind === 'text') ? 'text' : 'component';
}
