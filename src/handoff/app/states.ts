// Use case: which state of a draft a hand-off shows.

import { DEFAULT_STATES, type DraftStore, StatesSchema } from '../../drafts/index.ts';

/** The draft's states, and the one it is shown in when none is asked for: `filled`, else its default. */
export function draftStates(
  drafts: DraftStore,
  slug: string,
  base: string,
): { baseline: string; ids: string[] } {
  const parsed = StatesSchema.safeParse(drafts.readJson(slug, `${base}/src/json/states.json`));
  const states = parsed.success ? parsed.data : DEFAULT_STATES;
  const ids = states.states.map((state) => state.id);
  return { baseline: ids.includes('filled') ? 'filled' : states.default, ids };
}
