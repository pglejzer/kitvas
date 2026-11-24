// The server-made inverse of a structural change (spec 4b, decision 4; plan 14, task B1): text
// hunks. Undo finds each hunk's `find` in the current text and puts back `replace`, so another
// writer's lines elsewhere in the file survive; a hunk whose `find` is not there exactly once is a
// conflict, never a guess.
//
// The diff is over whole lines (a longest common subsequence, written here: no package). A line
// ends at `\n`, so a CRLF line keeps its `\r` and the hunks give the bytes back as they were.

import type { Hunk } from '../ops.ts';
import type { OffsetMap } from '../types.ts';

/** The `patch` op carries at most this many hunks (`EditOpSchema` in `ops.ts`). */
const MAX_HUNKS = 50;
/** Above this many table cells a diff's middle counts as all changed: correct, only larger. */
const MAX_CELLS = 2_000_000;

/** A changed run: `after` lines `[a0, a1)` stand where `before` lines `[b0, b1)` stood. */
type Region = { a0: number; a1: number; b0: number; b1: number };
/** A region with the context its `find` needs to be unique: `after` lines `[lo, hi)`. */
type Widened = Region & { lo: number; hi: number };
/** Old offsets `[from, to)` are new offsets `[at, at + to - from)`. */
type Segment = { from: number; to: number; at: number };
/** A line's content without its indent and ending, and where that content starts. */
type Piece = { key: string; at: number };
type Mapping = { segments: Segment[]; gone: Piece[]; added: Piece[] };

const CONFLICT: { conflict: 'changed' } = { conflict: 'changed' };

/** The lines of a text, each with its ending; the last one may have none. */
function linesOf(text: string): string[] {
  const lines: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = text.indexOf('\n', start);
    const next = end < 0 ? text.length : end + 1;
    lines.push(text.slice(start, next));
    start = next;
  }
  return lines;
}

/** Where each line starts, counted from `base`. */
function startsOf(lines: readonly string[], base: number): number[] {
  const starts: number[] = [];
  let at = base;
  for (const line of lines) {
    starts.push(at);
    at += line.length;
  }
  return starts;
}

/** How often `find` occurs in `text`: 0, 1, or 2 for more. Overlapping matches count. */
function occurrences(text: string, find: string): 0 | 1 | 2 {
  const first = text.indexOf(find);
  if (first < 0) return 0;
  // `''` occurs at every offset of a text, so it is unique only in `''`.
  return text.indexOf(find, first + 1) > first ? 2 : 1;
}

/** The equal lines a longest common subsequence keeps, as index pairs, for a middle part. */
function middlePairs(old: readonly string[], next: readonly string[]): [number, number][] {
  const n = old.length;
  const m = next.length;
  if (n === 0 || m === 0 || (n + 1) * (m + 1) > MAX_CELLS) return [];
  const ids = new Map<string, number>();
  const idOf = (line: string): number => {
    const known = ids.get(line);
    if (known !== undefined) return known;
    ids.set(line, ids.size);
    return ids.size - 1;
  };
  const a = old.map(idOf);
  const b = next.map(idOf);
  const width = m + 1;
  // `table[i * width + j]`: the length of the longest common subsequence of `a[i..]`, `b[j..]`.
  const table = new Uint32Array((n + 1) * width);
  const cell = (i: number, j: number): number => table[i * width + j] ?? 0;
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      table[i * width + j] =
        a[i] === b[j] ? cell(i + 1, j + 1) + 1 : Math.max(cell(i + 1, j), cell(i, j + 1));
    }
  }
  const pairs: [number, number][] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      pairs.push([i, j]);
      i += 1;
      j += 1;
    } else if (cell(i + 1, j) >= cell(i, j + 1)) i += 1;
    else j += 1;
  }
  return pairs;
}

/** The pairs `[i, j]` with `old[i] === next[j]` that stay, in order: head, middle, tail. */
function matchLines(old: readonly string[], next: readonly string[]): [number, number][] {
  let head = 0;
  while (head < old.length && head < next.length && old[head] === next[head]) head += 1;
  let tail = 0;
  while (
    tail < old.length - head &&
    tail < next.length - head &&
    old[old.length - 1 - tail] === next[next.length - 1 - tail]
  ) {
    tail += 1;
  }
  const pairs: [number, number][] = [];
  for (let k = 0; k < head; k += 1) pairs.push([k, k]);
  const middle = middlePairs(
    old.slice(head, old.length - tail),
    next.slice(head, next.length - tail),
  );
  for (const [i, j] of middle) pairs.push([head + i, head + j]);
  for (let k = tail; k > 0; k -= 1) pairs.push([old.length - k, next.length - k]);
  return pairs;
}

/** The runs between the kept pairs: every line that is not kept is in exactly one region. */
function regionsOf(pairs: readonly [number, number][], n: number, m: number): Region[] {
  const regions: Region[] = [];
  const ends: [number, number][] = [...pairs, [n, m]];
  let b = 0;
  let a = 0;
  for (const [pb, pa] of ends) {
    if (pb > b || pa > a) regions.push({ a0: a, a1: pa, b0: b, b1: pb });
    b = pb + 1;
    a = pa + 1;
  }
  return regions;
}

/** Two regions and the equal lines between them, as one. */
const join = (first: Region, second: Region): Region => ({
  a0: first.a0,
  a1: second.a1,
  b0: first.b0,
  b1: second.b1,
});

/** Joins the closest neighbours until one `patch` op can carry every hunk. */
function capped(regions: readonly Region[]): Region[] {
  const out = [...regions];
  const gapAfter = (i: number): number => (out[i + 1]?.a0 ?? 0) - (out[i]?.a1 ?? 0);
  while (out.length > MAX_HUNKS) {
    let best = 0;
    for (let i = 1; i < out.length - 1; i += 1) if (gapAfter(i) < gapAfter(best)) best = i;
    const first = out[best];
    const second = out[best + 1];
    if (first === undefined || second === undefined) break;
    out.splice(best, 2, join(first, second));
  }
  return out;
}

/** The fewest lines of context on each side that make the region's `find` unique in `after`. */
function widen(region: Region, lines: readonly string[], after: string): Widened {
  for (let k = 0; ; k += 1) {
    const lo = Math.max(0, region.a0 - k);
    const hi = Math.min(lines.length, region.a1 + k);
    // The whole text occurs in itself once, so the widening always ends.
    const whole = lo === 0 && hi === lines.length;
    if (whole || occurrences(after, lines.slice(lo, hi).join('')) === 1) {
      return { ...region, lo, hi };
    }
  }
}

/**
 * Hunks that turn `after` back into `before`: `applyHunks(after, makeHunks(before, after))` gives
 * `before` byte for byte. Each `find` occurs exactly once in `after` (context is widened by whole
 * lines until it does), and the hunks are as small as whole changed lines allow.
 */
export function makeHunks(before: string, after: string): Hunk[] {
  if (before === after) return [];
  const old = linesOf(before);
  const lines = linesOf(after);
  const pending = capped(regionsOf(matchLines(old, lines), old.length, lines.length));
  // Context never reaches into another hunk: a region whose context would overlap its
  // neighbour's lines is joined with that neighbour and widened again.
  const done: Widened[] = [];
  let index = 0;
  let region: Region | undefined = pending[0];
  while (region !== undefined) {
    const wide = widen(region, lines, after);
    const previous = done.at(-1);
    const following = pending[index + 1];
    if (previous !== undefined && wide.lo < previous.hi) {
      done.pop();
      region = join(previous, region);
    } else if (following !== undefined && wide.hi > following.a0) {
      region = join(region, following);
      index += 1;
    } else {
      done.push(wide);
      index += 1;
      region = pending[index];
    }
  }
  // Context lines lie between regions, where `after` line `x` is `before` line `x + b - a`.
  return done.map((wide) => ({
    find: lines.slice(wide.lo, wide.hi).join(''),
    replace: old.slice(wide.b0 - (wide.a0 - wide.lo), wide.b1 + (wide.hi - wide.a1)).join(''),
  }));
}

function pieceOf(line: string, at: number): Piece | null {
  const key = line.trim();
  return key === '' ? null : { key, at: at + line.length - line.trimStart().length };
}

/** Maps the lines a hunk keeps; notes the ones it takes out and puts in, for `movedLines`. */
function mapHunk(hunk: Hunk, from: number, to: number, mapping: Mapping): void {
  const old = linesOf(hunk.find);
  const next = linesOf(hunk.replace);
  const oldStarts = startsOf(old, from);
  const nextStarts = startsOf(next, to);
  const keptOld = new Set<number>();
  const keptNext = new Set<number>();
  for (const [i, j] of matchLines(old, next)) {
    keptOld.add(i);
    keptNext.add(j);
    const start = oldStarts[i] ?? from;
    mapping.segments.push({
      from: start,
      to: start + (old[i]?.length ?? 0),
      at: nextStarts[j] ?? to,
    });
  }
  old.forEach((line, i) => {
    const piece = keptOld.has(i) ? null : pieceOf(line, oldStarts[i] ?? from);
    if (piece !== null) mapping.gone.push(piece);
  });
  next.forEach((line, j) => {
    const piece = keptNext.has(j) ? null : pieceOf(line, nextStarts[j] ?? to);
    if (piece !== null) mapping.added.push(piece);
  });
}

function byKey(pieces: readonly Piece[]): Map<string, Piece[]> {
  const groups = new Map<string, Piece[]>();
  for (const piece of pieces) {
    const group = groups.get(piece.key);
    if (group === undefined) groups.set(piece.key, [piece]);
    else group.push(piece);
  }
  return groups;
}

/**
 * Lines taken out in one place and put in at another, maybe at another depth (an undone move):
 * the same content, as often among the lines taken out as among the lines put in, pairs in
 * order, so the elements on them keep their identity. Anything else stays `null`.
 */
function movedLines(gone: readonly Piece[], added: readonly Piece[]): Segment[] {
  const there = byKey(added);
  const segments: Segment[] = [];
  for (const [key, pieces] of byKey(gone)) {
    const targets = there.get(key);
    if (targets === undefined || targets.length !== pieces.length) continue;
    pieces.forEach((piece, i) => {
      const target = targets[i];
      if (target !== undefined) {
        segments.push({ from: piece.at, to: piece.at + key.length, at: target.at });
      }
    });
  }
  return segments;
}

function segmentMap(segments: readonly Segment[]): OffsetMap {
  const sorted = segments
    .filter((segment) => segment.to > segment.from)
    .sort((x, y) => x.from - y.from);
  return (old) => {
    let lo = 0;
    let hi = sorted.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const segment = sorted[mid];
      if (segment === undefined) return null;
      if (old < segment.from) hi = mid - 1;
      else if (old >= segment.to) lo = mid + 1;
      else return segment.at + old - segment.from;
    }
    return null;
  };
}

/**
 * Every hunk applied, or `conflict` when one `find` is missing or occurs more than once. Each
 * `find` is looked for in `text` as given, so one hunk's `replace` never feeds another's search.
 * `moved`: text outside the hunks shifts; inside one, the lines it keeps (its context) and lines
 * it moves whole map to their new place, and the rest is `null`.
 */
export function applyHunks(
  text: string,
  hunks: readonly Hunk[],
): { text: string; moved: OffsetMap } | { conflict: 'changed' } {
  const placed: { at: number; hunk: Hunk }[] = [];
  for (const hunk of hunks) {
    if (occurrences(text, hunk.find) !== 1) return CONFLICT;
    placed.push({ at: text.indexOf(hunk.find), hunk });
  }
  placed.sort((x, y) => x.at - y.at);
  const mapping: Mapping = { segments: [], gone: [], added: [] };
  let out = '';
  let cursor = 0;
  for (const { at, hunk } of placed) {
    // Two hunks over the same text cannot both be put back.
    if (at < cursor) return CONFLICT;
    mapping.segments.push({ from: cursor, to: at, at: out.length });
    out += text.slice(cursor, at);
    mapHunk(hunk, at, out.length, mapping);
    out += hunk.replace;
    cursor = at + hunk.find.length;
  }
  // One past the end, so the end of the text maps too.
  mapping.segments.push({ from: cursor, to: text.length + 1, at: out.length });
  out += text.slice(cursor);
  mapping.segments.push(...movedLines(mapping.gone, mapping.added));
  return { text: out, moved: segmentMap(mapping.segments) };
}
