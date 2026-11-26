// The draft page's links (plan 15, C3): the same view with one choice changed. The top bar
// (version, compare), the pills on the canvas (width, state) and the panes' next steps all build
// their links here.

import type { Draft } from '../../../drafts/index.ts';
import { type DraftChoice, draftHref } from '../../views/draft-query.ts';

/** Builds the link to this view with `change` applied. */
export type ChoiceLink = (change: Partial<DraftChoice>, compare?: number | null) => string;

/**
 * A comparison stays on while the view changes, except against the version it would show twice.
 * `compare` given explicitly (a number, or `null` for none) replaces the current one.
 */
export function choiceLink(draft: Draft, choice: DraftChoice): ChoiceLink {
  return (change, compare = choice.compare ?? null) => {
    const merged = { ...choice, ...change };
    // The values of the options stay too; another version keeps those it also has (its own page
    // drops the rest).
    const base: DraftChoice = {
      version: merged.version,
      state: merged.state,
      width: merged.width,
      ...(merged.options === undefined ? {} : { options: merged.options }),
    };
    const keep = compare !== null && compare !== merged.version;
    return draftHref(draft.slug, keep ? { ...base, compare } : base);
  };
}
