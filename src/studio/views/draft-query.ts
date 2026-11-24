// The view of a draft that a page address asks for: version, state and width, each with a default.

import { type Draft, latestVersion, type States } from '../../drafts/index.ts';

/** Phone, tablet and desktop, in CSS pixels: the widths the checks run at. */
export const WIDTHS = [390, 768, 1280] as const;
export type Width = (typeof WIDTHS)[number];

/** Any other width the canvas can show (`?view=`), in CSS pixels. */
export const MIN_VIEW = 320;
export const MAX_VIEW = 2560;

/**
 * How many cards the canvas shows side by side (`?cards=`, spec 4c goal 4): the width shown, that
 * and one more preset, or all three presets. A copy is in `client/studio/canvas/card-rules.ts`.
 */
export const CARD_COUNTS = [1, 2, 3] as const;
export type CardCount = (typeof CARD_COUNTS)[number];

/**
 * `compare`: the other version shown beside this one, when comparing.
 * `view`: a width that is not one of `WIDTHS`, shown in the card; the checks' findings and marks
 * stay on `width`.
 * `cards`: more than one card; absent for one. Compare has one card per version instead.
 */
export type DraftChoice = {
  version: number;
  state: string;
  width: Width;
  compare?: number;
  view?: number;
  cards?: CardCount;
};

/** `?version=`: one the draft has, else the latest. */
export function pickVersion(query: URLSearchParams, draft: Draft): number {
  const asked = Number(query.get('version'));
  return draft.versions.some((entry) => entry.number === asked) ? asked : latestVersion(draft);
}

/** `?state=`: one of this version's states, else its default. */
export function pickState(query: URLSearchParams, states: States): string {
  const asked = query.get('state');
  return states.states.find((state) => state.id === asked)?.id ?? states.default;
}

/** `?width=`: one of the three widths, else the phone. */
export function pickWidth(query: URLSearchParams): Width {
  const asked = Number(query.get('width'));
  return WIDTHS.find((width) => width === asked) ?? WIDTHS[0];
}

/**
 * `?view=`: a whole width from 320 to 2560 that is not one of the three; `null` for anything else.
 * A preset asked for as a view is no view: `width` names it.
 */
export function pickView(query: URLSearchParams): number | null {
  const text = query.get('view') ?? '';
  if (!/^[0-9]{3,4}$/.test(text)) return null;
  const asked = Number(text);
  if (asked < MIN_VIEW || asked > MAX_VIEW) return null;
  return WIDTHS.some((width) => width === asked) ? null : asked;
}

/**
 * `?compare=`: a version the draft has, other than the one shown; `null` for anything else.
 * `0` is the original of a rework draft ("version 0").
 */
export function pickCompare(query: URLSearchParams, draft: Draft, shown: number): number | null {
  if (query.get('compare') === '0') return draft.kind === 'rework' ? 0 : null;
  const asked = Number(query.get('compare'));
  return asked !== shown && draft.versions.some((entry) => entry.number === asked) ? asked : null;
}

/** `?cards=`: 1, 2 or 3; one card for anything else. */
export function pickCards(query: URLSearchParams): CardCount {
  const asked = Number(query.get('cards'));
  return CARD_COUNTS.find((count) => count === asked) ?? 1;
}

/** The preset nearest to `width`; the narrower one of two as near. */
export function nearestPreset(width: number): Width {
  let best: Width = WIDTHS[0];
  for (const preset of WIDTHS) {
    if (Math.abs(preset - width) < Math.abs(best - width)) best = preset;
  }
  return best;
}

/**
 * The preset widths of the cards beside the one that shows `shown` (the width in the dock), in
 * ascending order. Two cards: the next preset up, or the one below when there is none. Three: the
 * presets other than the one `shown` stands for (a custom width stands for its nearest preset).
 */
export function extraWidths(count: CardCount, shown: number): Width[] {
  if (count === 1) return [];
  if (count === 3) return WIDTHS.filter((width) => width !== nearestPreset(shown));
  const up = WIDTHS.find((width) => width > shown);
  const down = [...WIDTHS].reverse().find((width) => width < shown);
  const next = up ?? down;
  return next === undefined ? [] : [next];
}

/** The address of a view; it names all three, so a link always shows the same thing. */
export function draftHref(slug: string, choice: DraftChoice): string {
  const query = new URLSearchParams({
    version: String(choice.version),
    state: choice.state,
    width: String(choice.width),
  });
  if (choice.compare !== undefined) query.set('compare', String(choice.compare));
  if (choice.view !== undefined) query.set('view', String(choice.view));
  // Compare has its own two cards; more widths are only for one version.
  if (choice.cards !== undefined && choice.cards > 1 && choice.compare === undefined) {
    query.set('cards', String(choice.cards));
  }
  return `/drafts/${slug}?${query}`;
}
