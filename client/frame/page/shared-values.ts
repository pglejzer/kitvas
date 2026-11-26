// The shared values of the page in use (plan 26, ADR 0086): what the person has chosen while using
// the draft, such as a date range or a search text. The bundle's entry holds them (a draft's
// sections share them as props) and keeps them on `globalThis` under `SHARED_HOLD`, so the next
// build of the same page, which brings its own bundle, starts from what the person had chosen.
// Only what the new build still declares stays (`keepShared`).

import {
  keepShared,
  SHARED_HOLD,
  type SharedState,
  type SharedValue,
} from '../../../src/shared/values/shared-values.ts';

export type HeldShared = {
  get(): SharedState;
  /** Merges the change, keeps the result and returns it; an undeclared key or value changes nothing. */
  set(change: Partial<SharedState>): SharedState;
};

export function holdShared(
  values: readonly SharedValue[],
  scope: Record<string, unknown> = globalThis as Record<string, unknown>,
): HeldShared {
  let now = keepShared(values, scope[SHARED_HOLD]);
  scope[SHARED_HOLD] = now;
  return {
    get: () => now,
    set(change) {
      const valid = keepShared(values, change);
      const next: SharedState = { ...now };
      for (const { id } of values) {
        const wanted = change[id];
        if (wanted !== undefined && valid[id] === wanted) next[id] = wanted;
      }
      now = next;
      scope[SHARED_HOLD] = now;
      return now;
    },
  };
}
