// The shared values of a draft's version (plan 26, ADR 0086): what a person has chosen on the page
// while using it, such as the date range, the grouping or the search text. One section's control
// sets a value and other sections read it. Pure values and rules, no package: the server and the
// frame both import this file (ADR 0080). The file a version keeps them in is read by the drafts
// module (`src/drafts/domain/shared-values.ts`).

/** Where a version keeps its shared values, from the version folder. */
export const SHARED_FILE = 'src/json/shared.json';
/** The name the frame keeps the current values under, so they live through a build swap. */
export const SHARED_HOLD = '__KITVAS_SHARED__';

export const MAX_SHARED_VALUES = 12;
export const MIN_SHARED_CHOICES = 2;
export const MAX_SHARED_CHOICES = 24;
/** The longest default of a text value. */
export const MAX_SHARED_TEXT = 80;

export type SharedValue = {
  /** As an option's id (`OPTION_ID`). */
  id: string;
  label: string;
  /** The id of one of `values`; any text when `values` is null. */
  default: string;
  /** The values it takes (ids as `OPTION_VALUE`); null for free text, such as a search field. */
  values: { id: string; label: string }[] | null;
};

/** Shared value id to its current value, for every shared value of the version. */
export type SharedState = Record<string, string>;

/** Every shared value at its default. */
export function defaultShared(values: readonly SharedValue[]): SharedState {
  return Object.fromEntries(values.map((value) => [value.id, value.default]));
}

/**
 * The defaults, with what `held` holds laid over them: only for an id the version has, a string,
 * and for a list one of its values. Anything else in `held` is dropped.
 */
export function keepShared(values: readonly SharedValue[], held: unknown): SharedState {
  const state = defaultShared(values);
  if (typeof held !== 'object' || held === null) return state;
  const kept = held as Record<string, unknown>;
  for (const value of values) {
    const now = kept[value.id];
    if (typeof now !== 'string') continue;
    if (value.values !== null && !value.values.some((choice) => choice.id === now)) continue;
    state[value.id] = now;
  }
  return state;
}
