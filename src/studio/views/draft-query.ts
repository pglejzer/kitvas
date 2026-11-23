// The view of a draft that a page address asks for: version, state and width, each with a default.

import { type Draft, latestVersion, type States } from '../../drafts/index.ts';

/** Phone, tablet and desktop, in CSS pixels. */
export const WIDTHS = [390, 768, 1280] as const;
export type Width = (typeof WIDTHS)[number];

/** `compare`: the other version shown beside this one, when comparing. */
export type DraftChoice = { version: number; state: string; width: Width; compare?: number };

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

/** `?compare=`: a version the draft has, other than the one shown; `null` for anything else. */
export function pickCompare(query: URLSearchParams, draft: Draft, shown: number): number | null {
  const asked = Number(query.get('compare'));
  return asked !== shown && draft.versions.some((entry) => entry.number === asked) ? asked : null;
}

/** The address of a view; it names all three, so a link always shows the same thing. */
export function draftHref(slug: string, choice: DraftChoice): string {
  const query = new URLSearchParams({
    version: String(choice.version),
    state: choice.state,
    width: String(choice.width),
  });
  if (choice.compare !== undefined) query.set('compare', String(choice.compare));
  return `/drafts/${slug}?${query}`;
}
