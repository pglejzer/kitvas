// What the frames of one page reported, made into the facts of C3: counts added up across frames,
// most used first (ties by value, so the same page gives the same facts), cut to the sizes the
// schema allows; candidates ordered by kind, then inside `main` first and banners last, numbered
// per kind as their crops are kept.

import {
  CANDIDATE_KINDS,
  type Candidate,
  type CandidateKind,
  ROLE_TAGS,
  type ScanFacts,
  TEXT_MAX,
} from '../domain/scan-facts.ts';
import type { Cut } from './playwright-images.ts';
import type { Rect } from './playwright-reach.ts';
import type { FrameCandidate } from './playwright-scan-candidates.ts';
import type { FrameStyles, Tally, Where } from './playwright-scan-styles.ts';

/** The sizes `ScanFactsSchema` takes. */
const LIMITS = {
  colours: 24,
  families: 8,
  type: 16,
  spacing: 16,
  radii: 8,
  shadows: 8,
  borders: 8,
  rootVars: 400,
};
const VALUE_MAX = 200;
const FAMILY_MAX = 60;
const VAR_NAME = /^--[A-Za-z0-9_-]{1,64}$/;
const STYLE_KEY = /^[a-z-]{1,40}$/;
const WHERE: readonly Where[] = ['text', 'background', 'border'];

export type MergedStyles = Omit<ScanFacts, 'schemaVersion' | 'url' | 'width' | 'candidates'>;
/** A candidate with its box measured and its crop placed, before it has an id. */
export type Chosen = {
  kind: CandidateKind;
  box: Rect;
  /** The crop in the page shot: the box widened by the shadow, clamped. */
  rect: Rect;
  text: string;
  style: Record<string, string>;
};
export type Located = { frame: number; candidate: FrameCandidate };

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const pageText = (text: string): { pageText: string } => ({ pageText: text.slice(0, TEXT_MAX) });

function mergeTallies(lists: Tally[][], max: number, valueMax = VALUE_MAX): Tally[] {
  const counts = new Map<string, number>();
  for (const list of lists) {
    for (const { value, count } of list) {
      if (value === '' || value.length > valueMax || !(count >= 1)) continue;
      counts.set(value, (counts.get(value) ?? 0) + Math.round(count));
    }
  }
  return Array.from(counts, ([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || compare(a.value, b.value))
    .slice(0, max);
}

function mergeColours(frames: FrameStyles[]): ScanFacts['colours'] {
  const merged = new Map<string, { count: number; where: Set<Where> }>();
  for (const frame of frames) {
    for (const { value, count, where } of frame.colours) {
      if (!/^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/.test(value) || !(count >= 1)) continue;
      const entry = merged.get(value) ?? { count: 0, where: new Set<Where>() };
      entry.count += Math.round(count);
      for (const place of where) entry.where.add(place);
      merged.set(value, entry);
    }
  }
  return Array.from(merged, ([value, entry]) => ({
    value,
    count: entry.count,
    where: WHERE.filter((place) => entry.where.has(place)),
  }))
    .filter((colour) => colour.where.length > 0)
    .sort((a, b) => b.count - a.count || compare(a.value, b.value))
    .slice(0, LIMITS.colours);
}

function mergeTypes(frames: FrameStyles[]): ScanFacts['type'] {
  const merged = new Map<string, ScanFacts['type'][number]>();
  for (const frame of frames) {
    for (const entry of frame.type) {
      const family = entry.family.slice(0, FAMILY_MAX);
      const parts = [entry.size, entry.lineHeight, entry.weight];
      if (parts.some((part) => part.length > VALUE_MAX) || !(entry.count >= 1)) continue;
      const key = [family, ...parts].join('|');
      const known = merged.get(key);
      if (known) known.count += Math.round(entry.count);
      else merged.set(key, { ...entry, family, count: Math.round(entry.count) });
    }
  }
  const keyOf = (entry: ScanFacts['type'][number]): string =>
    [entry.family, entry.size, entry.lineHeight, entry.weight].join('|');
  return Array.from(merged.values())
    .sort((a, b) => b.count - a.count || compare(keyOf(a), keyOf(b)))
    .slice(0, LIMITS.type);
}

/** The type of each tag from the first frame that has it, in the order of ROLE_TAGS. */
function mergeRoles(frames: FrameStyles[]): ScanFacts['roles'] {
  const roles: ScanFacts['roles'] = [];
  for (const tag of ROLE_TAGS) {
    const role = frames.flatMap((frame) => frame.roles).find((entry) => entry.tag === tag);
    if (role === undefined) continue;
    const parts = [role.size, role.weight, role.lineHeight];
    if (parts.some((part) => part.length > VALUE_MAX)) continue;
    roles.push({ ...role, family: role.family.slice(0, FAMILY_MAX) });
  }
  return roles;
}

/** Custom properties by name, the first frame's value kept, sorted by name. */
function mergeVars(frames: FrameStyles[]): ScanFacts['rootVars'] {
  const values = new Map<string, string>();
  for (const frame of frames) {
    for (const { name, value } of frame.rootVars) {
      if (VAR_NAME.test(name) && !values.has(name)) values.set(name, value);
    }
  }
  return Array.from(values, ([name, value]) => ({ name, value: pageText(value) }))
    .sort((a, b) => compare(a.name, b.name))
    .slice(0, LIMITS.rootVars);
}

export function mergeStyles(frames: FrameStyles[]): MergedStyles {
  const tallies = (pick: (frame: FrameStyles) => Tally[]): Tally[][] => frames.map(pick);
  const widths = frames.flatMap((frame) => frame.breakpoints);
  return {
    title: pageText(frames[0]?.title ?? ''),
    colours: mergeColours(frames),
    families: mergeTallies(
      tallies((frame) => frame.families),
      LIMITS.families,
      FAMILY_MAX,
    ),
    type: mergeTypes(frames),
    roles: mergeRoles(frames),
    spacing: mergeTallies(
      tallies((frame) => frame.spacing),
      LIMITS.spacing,
    ),
    radii: mergeTallies(
      tallies((frame) => frame.radii),
      LIMITS.radii,
    ),
    shadows: mergeTallies(
      tallies((frame) => frame.shadows),
      LIMITS.shadows,
    ),
    borders: mergeTallies(
      tallies((frame) => frame.borders),
      LIMITS.borders,
    ),
    rootVars: mergeVars(frames),
    breakpoints: [...new Set(widths)]
      .filter((width) => Number.isInteger(width) && width >= 0)
      .sort((a, b) => a - b),
  };
}

/** Every frame's candidates in the order of the facts: by kind, rank, frame, then the page's order. */
export function rankCandidates(frames: FrameCandidate[][]): Located[] {
  const kindOrder = (kind: CandidateKind): number => CANDIDATE_KINDS.indexOf(kind);
  return frames
    .flatMap((list, frame) => list.map((candidate) => ({ frame, candidate })))
    .sort(
      (a, b) =>
        kindOrder(a.candidate.kind) - kindOrder(b.candidate.kind) ||
        a.candidate.rank - b.candidate.rank ||
        a.frame - b.frame ||
        a.candidate.order - b.candidate.order,
    );
}

function cleanStyle(style: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(style).filter(
      ([key, value]) =>
        STYLE_KEY.test(key) && typeof value === 'string' && value.length <= VALUE_MAX,
    ),
  );
}

/**
 * The candidates whose crop was cut and fits in what is left of `budget` bytes, numbered per kind
 * (`button-0`, `button-1`…), each with its PNG. The first crop that does not fit ends the list.
 */
export function numberCandidates(
  chosen: Chosen[],
  cuts: Cut[],
  budget: number,
): { candidate: Candidate; png: Uint8Array }[] {
  const counts = new Map<CandidateKind, number>();
  const kept: { candidate: Candidate; png: Uint8Array }[] = [];
  let left = budget;
  for (const [index, item] of chosen.entries()) {
    const cut = cuts[index];
    if (cut === undefined || !cut.ok) continue;
    if (cut.png.byteLength > left) break;
    left -= cut.png.byteLength;
    const n = counts.get(item.kind) ?? 0;
    counts.set(item.kind, n + 1);
    const id = `${item.kind}-${n}`;
    kept.push({
      candidate: {
        id,
        kind: item.kind,
        box: item.box,
        crop: `crops/${id}.png`,
        text: pageText(item.text),
        style: cleanStyle(item.style),
      },
      png: cut.png,
    });
  }
  return kept;
}
