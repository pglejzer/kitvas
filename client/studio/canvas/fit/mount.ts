// The fit of the canvas's top bars (plan 25, contract C5): the Lens pill at the left and the pill
// row at the right must keep a gap between them. This measures the real gap at each step, from
// the fullest form up, and sets `data-fit` (0 to 3) on the canvas; the skin hides and shows the
// bars' parts by it (`steps.ts` says what each step is). It measures again when the canvas or
// either group changes size, as counts, labels and the window do.
//
// It settles: every pass starts at step 0 and compares what it measured there (the sizes the bars
// have in full) with the last pass. Its own change of `data-fit` changes the bars' sizes, which
// only shows in the next frame as a size change, and that pass finds the same sizes at step 0 and
// puts the step back. The bottom row has no script (`stage.ts` of the skin: a grid).

import { type FitStep, pickStep } from './steps.ts';

const LENS = '[data-lens-pill]';
const ROW = '[data-shell="dock"]';

export function mountFit(main: HTMLElement): void {
  const canvas = main.querySelector<HTMLElement>('.stage-canvas');
  const lens = main.querySelector<HTMLElement>(LENS);
  const row = main.querySelector<HTMLElement>(ROW);
  if (!canvas || !lens || !row) return;

  /** The room between the Lens pill and the pill row; unbounded while one of them is not drawn. */
  const gap = (): number => {
    const left = lens.getBoundingClientRect();
    const right = row.getBoundingClientRect();
    if (left.width === 0 || right.width === 0) return Number.POSITIVE_INFINITY;
    return right.left - left.right;
  };
  /** What a pass measures from: the canvas and the two groups at step 0. */
  const sizes = (): string =>
    [canvas.clientWidth, lens.offsetWidth, row.offsetWidth].map(Math.round).join('x');

  let measured = '';
  let step: FitStep = 0;
  const set = (next: FitStep): void => {
    canvas.dataset.fit = String(next);
  };

  function run(): void {
    set(0);
    const from = sizes();
    if (from === measured) {
      set(step);
      return;
    }
    step = pickStep((next) => {
      set(next);
      return gap();
    });
    set(step);
    measured = from;
  }

  let frame = 0;
  /** One pass for every change that came in one frame. */
  function soon(): void {
    if (frame !== 0) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      run();
    });
  }

  run();
  if (typeof ResizeObserver === 'function') {
    const watch = new ResizeObserver(soon);
    for (const node of [canvas, lens, row]) watch.observe(node);
  } else {
    window.addEventListener('resize', soon);
  }
}
