// The page's lens (redesign spec, goal 9; plan 19): what the canvas draws over the draft. One lens
// at a time, and never kept: every page load starts at Design. The editor and the draft page's own
// script both read it here, so it is not part of the editor's store. `data-lens` on `<html>` is
// what the skins read.

export const LENSES = ['design', 'kit', 'checks', 'why', 'changes'] as const;
export type LensId = (typeof LENSES)[number];

/** Kit and Changes read what only the editor knows: they need Edit. */
export const EDIT_LENSES: readonly LensId[] = ['kit', 'changes'];

export type LensListener = (lens: LensId, before: LensId) => void;

export type LensStore = {
  get(): LensId;
  /** Tells the listeners once; a `set` to the lens that is on tells nobody. */
  set(lens: LensId): void;
  /** Returns the way to stop listening. */
  subscribe(listener: LensListener): () => void;
};

/** As much of the page's root as the store marks; `null` outside a page (the tests run in Node). */
export type LensRoot = { dataset: Record<string, string | undefined> };

/** Whether a lens can be on: Kit and Changes only while Edit is. */
export const lensAllowed = (lens: LensId, editing: boolean): boolean =>
  editing || !EDIT_LENSES.includes(lens);

export function createLens(root: LensRoot | null): LensStore {
  let now: LensId = 'design';
  const listeners = new Set<LensListener>();
  if (root) root.dataset.lens = now;
  return {
    get: () => now,
    set(lens) {
      if (lens === now) return;
      const before = now;
      now = lens;
      if (root) root.dataset.lens = lens;
      // A copy: a listener may stop listening while it is told.
      for (const listener of [...listeners]) listener(lens, before);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/** The page's one lens. */
export const lens: LensStore = createLens(
  typeof document === 'undefined' ? null : document.documentElement,
);
