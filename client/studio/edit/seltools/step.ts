// The step of the variant pill (redesign spec, goal 11; plan 19): the pill says how the variant on
// the canvas is flipped (`setVariantStep`); the left and right arrow keys call `stepVariant`. With
// no pill showing the caller hears `false`, and the key stays the page's.

let step: ((by: -1 | 1) => boolean) | null = null;

export function setVariantStep(next: ((by: -1 | 1) => boolean) | null): void {
  step = next;
}

/** Flips the variant on the canvas; false when no pill shows. */
export function stepVariant(by: -1 | 1): boolean {
  return step === null ? false : step(by);
}
