// The way a hand moves a pointer, as points in time: a slight arc, a quick start, a long soft
// landing, and on a long way a small step past the target and back. Pure: the stage plays the same
// points with the real pointer and with the drawn one.

export type Point = { x: number; y: number };

/** The time between two points of a path. */
export const STEP_MS = 16;

/** A number from 0 to 1 that follows from `seed`, so a take moves the same way every time. */
export function chance(seed: number): number {
  let t = (seed + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** How long a hand takes over `distance` px: longer for a longer way, but less than in proportion. */
export function handTime(distance: number): number {
  return Math.min(Math.max(240 + 150 * Math.log2(distance / 60 + 1), 300), 1100);
}

/** 0 to 1 over 0 to 1: the top speed comes after about a third of the time, the landing is slow. */
function progress(t: number): number {
  const u = t ** 0.72;
  return u * u * u * (10 - 15 * u + 6 * u * u);
}

/**
 * Where a press lands in a box of `width` by `height`, from its centre: near the middle, never
 * exactly on it.
 */
export function handAim(width: number, height: number, seed: number): Point {
  const part = (size: number, most: number, at: number): number =>
    Math.max(-most, Math.min(most, (chance(at) - 0.5) * 0.24 * size));
  return { x: part(width, 14, seed), y: part(height, 5, seed + 1) };
}

/**
 * The points of the way from `from` to `to`, one every `STEP_MS` over `ms`; the last one is `to`.
 * The way bends to one side, and past 380 px it ends a few pixels beyond `to` before it comes back.
 */
export function handPath(from: Point, to: Point, ms: number, seed: number): Point[] {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);
  if (distance < 2) return [to];
  const along = { x: dx / distance, y: dy / distance };
  const across = { x: -along.y, y: along.x };
  const side = chance(seed) < 0.5 ? -1 : 1;
  const bend = side * Math.min(distance * (0.07 + 0.09 * chance(seed + 1)), 70);
  const past = distance > 380 ? 5 + 6 * chance(seed + 2) : 0;
  const far = {
    x: to.x + along.x * past + across.x * past * 0.4 * side,
    y: to.y + along.y * past + across.y * past * 0.4 * side,
  };
  // The bend sits before the middle: a hand swings out early and comes in straight.
  const via = {
    x: from.x + dx * 0.42 + across.x * bend,
    y: from.y + dy * 0.42 + across.y * bend,
  };
  const back = past === 0 ? 0 : Math.min(170, ms * 0.24);
  const steps = Math.max(2, Math.round((ms - back) / STEP_MS));
  const points: Point[] = [];
  for (let step = 1; step <= steps; step += 1) {
    const s = progress(step / steps);
    const keep = 1 - s;
    points.push({
      x: keep * keep * from.x + 2 * keep * s * via.x + s * s * far.x,
      y: keep * keep * from.y + 2 * keep * s * via.y + s * s * far.y,
    });
  }
  const backSteps = past === 0 ? 0 : Math.max(2, Math.round(back / STEP_MS));
  for (let step = 1; step <= backSteps; step += 1) {
    const s = 1 - (1 - step / backSteps) ** 2;
    points.push({ x: far.x + (to.x - far.x) * s, y: far.y + (to.y - far.y) * s });
  }
  return points;
}
