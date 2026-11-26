// The steps by which the canvas's top bars give room to each other (plan 25, contract C5): 0 is
// every bar in full, 1 drops the Options pill's word, 2 shows only the width in use in the width
// pill, 3 shows only the lens in use in the Lens pill. Pure; `mount.ts` measures.

export type FitStep = 0 | 1 | 2 | 3;

const STEPS: readonly FitStep[] = [0, 1, 2, 3];

/** The gap in pixels the two groups keep between them. */
const MIN_GAP = 12;

/**
 * The first step whose gap is at least `min`, else the last. `gapAt` is asked step by step, in
 * order, and only until one is wide enough: it applies the step and reads the real boxes.
 */
export function pickStep(gapAt: (step: FitStep) => number, min = MIN_GAP): FitStep {
  for (const step of STEPS) {
    if (gapAt(step) >= min) return step;
  }
  return 3;
}
