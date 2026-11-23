// The arithmetic of a state switch's motion (FLIP: first, last, invert, play). No DOM here:
// boxes come in, the transforms to start from go out. `motion.ts` measures and plays them.

/** A box in CSS pixels of the viewport, as `getBoundingClientRect` gives it. */
export type Box = { left: number; top: number; width: number; height: number };

/**
 * An element's start transform with its origin at its top-left corner:
 * `translate(x, y) scale(sx, sy)`, played back to none.
 */
export type Step = { x: number; y: number; sx: number; sy: number };

/** Per axis `seen = s * laid + t`: what the moving elements around an element do to it. */
type Carry = { sx: number; sy: number; tx: number; ty: number };

const STILL: Carry = { sx: 1, sy: 1, tx: 0, ty: 0 };

/** `--kit-motion-slow` of Base. */
export const MOTION_MS = 240;
/** `--kit-motion-fast` of Base: the fade that replaces movement when less motion is asked for. */
export const FADE_MS = 120;
export const EASING = 'ease-out';
/** More moving parts than this read as a new page: the root fades instead. */
export const MAX_MOVING = 400;

/** A difference smaller than this many pixels does not show. */
const EPSILON = 0.5;
/** Scales outside this range come from a box that nearly vanished; they are capped. */
const MIN_SCALE = 0.02;
const MAX_SCALE = 50;

/**
 * How an element may move: `full` slides and resizes, `move` only slides (its size is not
 * animated), `none` is carried by the elements around it.
 */
export type MotionKind = 'none' | 'move' | 'full';

export type MotionFacts = {
  /** Computed `display`. */
  display: string;
  /** An image, a control, a canvas or an outer `<svg>`: boxes even when `display` is inline. */
  replaced: boolean;
  /** An HTML element or an outer `<svg>`: CSS transforms apply to it. */
  transformable: boolean;
  /** It has a transform of its own; animating `transform` would replace it. */
  transformed: boolean;
  /** A fixed or absolutely placed element inside it would lose its place under a transform. */
  pinned: boolean;
};

export function motionKind(facts: MotionFacts): MotionKind {
  const { display, replaced, transformable, transformed, pinned } = facts;
  if (!transformable || transformed || pinned) return 'none';
  if (display === 'none' || display === 'contents') return 'none';
  // CSS transforms do not apply to inline boxes that are not replaced.
  if (display === 'inline' && !replaced) return 'none';
  return display.startsWith('inline') ? 'move' : 'full';
}

/** Where an element has to appear when the motion starts: its old box, or its old corner. */
export function startBox(first: Box, last: Box, kind: MotionKind): Box {
  if (kind === 'full') return first;
  return { left: first.left, top: first.top, width: last.width, height: last.height };
}

/** `box`, seen on the page, taken back through what the elements around it do. */
function unCarry(carry: Carry, box: Box): Box {
  return {
    left: (box.left - carry.tx) / carry.sx,
    top: (box.top - carry.ty) / carry.sy,
    width: box.width / carry.sx,
    height: box.height / carry.sy,
  };
}

const capScale = (value: number): number => Math.min(Math.max(value, MIN_SCALE), MAX_SCALE);

/**
 * The step that shows an element laid out at `last` at `target`; `undefined` when the difference
 * would not show.
 */
export function stepTo(last: Box, target: Box): Step | undefined {
  const x = target.left - last.left;
  const y = target.top - last.top;
  const sx = last.width >= 1 ? capScale(target.width / last.width) : 1;
  const sy = last.height >= 1 ? capScale(target.height / last.height) : 1;
  const resized =
    Math.abs((sx - 1) * last.width) >= EPSILON || Math.abs((sy - 1) * last.height) >= EPSILON;
  if (Math.abs(x) < EPSILON && Math.abs(y) < EPSILON && !resized) return undefined;
  return { x, y, sx, sy };
}

/** What the elements around one do to it, once that one also plays `step`. */
function carryOn(carry: Carry, last: Box, step: Step): Carry {
  return {
    sx: carry.sx * step.sx,
    sy: carry.sy * step.sy,
    tx: carry.sx * (last.left * (1 - step.sx) + step.x) + carry.tx,
    ty: carry.sy * (last.top * (1 - step.sy) + step.y) + carry.ty,
  };
}

/** One `[data-ks]` element after the new state rendered, in document order. */
export type Entry = {
  /** Index of the nearest entry the element sits in, or -1. It comes before this one. */
  parent: number;
  /** Its box before the switch; `undefined` when it was not there. */
  first: Box | undefined;
  /** Its box now. */
  last: Box;
  kind: MotionKind;
};

export type MotionPlan = {
  moves: { index: number; step: Step }[];
  /** Entries that are new; their new descendants fade with them. */
  fades: number[];
  /** Too much changed to move piece by piece. */
  crowded: boolean;
};

const shows = (box: Box | undefined): box is Box =>
  box !== undefined && (box.width > 0 || box.height > 0);

/**
 * The plan of a switch. Steps are worked out parents first: a child's step undoes what its
 * moving parents do to it, so every element starts exactly where it was seen and ends where it
 * is laid out.
 */
export function planMotion(entries: Entry[]): MotionPlan {
  const carries: Carry[] = [];
  const fresh: boolean[] = [];
  const moves: MotionPlan['moves'] = [];
  const fades: number[] = [];
  for (const [index, entry] of entries.entries()) {
    const carry = carries[entry.parent] ?? STILL;
    const freshParent = fresh[entry.parent] === true;
    carries[index] = carry;
    fresh[index] = freshParent;
    if (!shows(entry.last)) continue;
    if (!shows(entry.first)) {
      fresh[index] = true;
      if (!freshParent) fades.push(index);
      continue;
    }
    if (entry.kind === 'none') continue;
    const target = unCarry(carry, startBox(entry.first, entry.last, entry.kind));
    const step = stepTo(entry.last, target);
    if (!step) continue;
    moves.push({ index, step });
    carries[index] = carryOn(carry, entry.last, step);
  }
  return { moves, fades, crowded: moves.length + fades.length > MAX_MOVING };
}

/** A number for CSS: a few decimals, never `-0`. */
function css(value: number, digits: number): string {
  const rounded = Number(value.toFixed(digits));
  return String(rounded === 0 ? 0 : rounded);
}

export function stepTransform(step: Step): string {
  const move = `translate(${css(step.x, 3)}px, ${css(step.y, 3)}px)`;
  return `${move} scale(${css(step.sx, 5)}, ${css(step.sy, 5)})`;
}

/** Whether the viewer asked for less motion. Without `matchMedia` (outside a browser): no. */
export function prefersLessMotion(
  match: ((query: string) => { matches: boolean }) | undefined,
): boolean {
  return match?.('(prefers-reduced-motion: reduce)').matches === true;
}
