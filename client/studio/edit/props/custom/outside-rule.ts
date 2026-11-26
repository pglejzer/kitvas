// When a "Custom..." editor closes on its own: a press outside it, or the window losing the pointer
// to the canvas (a sandboxed frame gives the page no press, only a blur). Pure: no DOM; the
// listeners that ask are `outside.ts`. A press inside (the editor, its row, a list's popup) keeps
// it; so does everything while the eyedropper is picking, which happens outside the page. Only a
// press and a blur ask: a drag that ends outside, a scroll and a key never do.

export type Verdict = 'keep' | 'close';

/** What a press does to an open editor; `inside` is whether it landed on the editor or its row. */
export function pressVerdict(press: { inside: boolean; picking: boolean }): Verdict {
  return press.inside || press.picking ? 'keep' : 'close';
}

/** What the window losing the pointer does to an open editor. */
export function blurVerdict(state: { picking: boolean }): Verdict {
  return state.picking ? 'keep' : 'close';
}

/** Something that can say whether a node is under it (an element). */
export type Holder = { contains(node: unknown): boolean };

/** Whether `target` is inside any of `parts` (a part that is gone, `null`, holds nothing). */
export function insideAny(target: unknown, parts: readonly (Holder | null)[]): boolean {
  if (target === null || target === undefined) return false;
  return parts.some((part) => part?.contains(target) === true);
}
