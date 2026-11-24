// Matching held ids after Claude changed a file (spec 4b, decision 7; plan 14, task D1): by the JSX path
// and the content (tag, props, text), best effort, from the structure before and after.
//
// In order, for each held id:
// 1. An element whose source is unchanged (same file, tag and `hash`) is found exactly, wherever it
//    went: the equal ones are paired by the same id first, the rest in document order. This also
//    follows the siblings a new element pushed one place on (`Card` → `Card.2`).
// 2. An id the structure did not know before is kept: there is nothing to match it by.
// 3. An id still there, and not taken by an element found exactly, is the element Claude edited
//    in place.
// 4. Else the best scoring element of the same file and tag that no other match took: its text and
//    the texts inside it (weight 3), its prop names (1) and the closeness of its JSX path (1). Under
//    `MATCH_THRESHOLD` it is `null`: no text in common is no match.

import type { StructureEntry } from '../../../src/studio/api/structure-schemas.ts';
import { forgetIds, heldIds, remapIds } from './remap.ts';
import type { EditorState } from './store.ts';

/** The least score that counts as the same element: a third of its words, with props and path. */
export const MATCH_THRESHOLD = 3;

const exactKey = (entry: StructureEntry): string => `${entry.file}\n${entry.tag}\n${entry.hash}`;

function groupBy(list: readonly StructureEntry[]): Map<string, StructureEntry[]> {
  const groups = new Map<string, StructureEntry[]>();
  for (const entry of list) {
    const key = exactKey(entry);
    const group = groups.get(key);
    if (group) group.push(entry);
    else groups.set(key, [entry]);
  }
  return groups;
}

/** Old id → new id of every element whose source did not change (rule 1). */
export function exactPairs(
  before: readonly StructureEntry[],
  after: readonly StructureEntry[],
): Map<string, string> {
  const pairs = new Map<string, string>();
  const later = groupBy(after);
  for (const [key, was] of groupBy(before)) {
    const now = later.get(key);
    if (!now) continue;
    const ids = new Set(now.map((entry) => entry.id));
    const same = was.filter((entry) => ids.has(entry.id));
    for (const entry of same) pairs.set(entry.id, entry.id);
    const kept = new Set(same.map((entry) => entry.id));
    const rest = now.filter((entry) => !kept.has(entry.id));
    const left = was.filter((entry) => !kept.has(entry.id));
    for (let index = 0; index < left.length && index < rest.length; index += 1) {
      const from = left[index];
      const to = rest[index];
      if (from && to) pairs.set(from.id, to.id);
    }
  }
  return pairs;
}

const wordsOf = (text: string | null): string[] =>
  text === null ? [] : text.toLowerCase().split(/\s+/).filter(Boolean);

/** Each element's words: its own text and the texts of every element inside it. */
function contentWords(list: readonly StructureEntry[]): Map<string, string[]> {
  const words = new Map<string, string[]>();
  for (const entry of list) words.set(entry.id, wordsOf(entry.text));
  // Children come after their parent in document order: walking back, each element's words are
  // complete when they are added to its parent's.
  for (let index = list.length - 1; index >= 0; index -= 1) {
    const entry = list[index];
    if (!entry || entry.parent === null) continue;
    const own = words.get(entry.id);
    const parent = words.get(entry.parent);
    if (own && parent) parent.push(...own);
  }
  return words;
}

/** Dice over two word lists, each word counted as often as it occurs; 0 when both are empty. */
export function textLikeness(a: readonly string[], b: readonly string[]): number {
  if (a.length === 0 && b.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const word of a) counts.set(word, (counts.get(word) ?? 0) + 1);
  let common = 0;
  for (const word of b) {
    const left = counts.get(word) ?? 0;
    if (left > 0) {
      common += 1;
      counts.set(word, left - 1);
    }
  }
  return (2 * common) / (a.length + b.length);
}

/** Jaccard over prop names; 1 when neither writes any. */
export function propLikeness(a: readonly string[], b: readonly string[]): number {
  const left = new Set(a);
  const right = new Set(b);
  if (left.size === 0 && right.size === 0) return 1;
  let common = 0;
  for (const name of left) if (right.has(name)) common += 1;
  return common / (left.size + right.size - common);
}

/** The JSX path after the `:`, each tag without its `.n`. */
const pathOf = (id: string): string[] =>
  id
    .slice(id.indexOf(':') + 1)
    .split('/')
    .map((part) => part.replace(/\.\d+$/, ''));

/** The share of the two JSX paths that is the same from the root down, 0 to 1. */
export function pathCloseness(a: string, b: string): number {
  const left = pathOf(a);
  const right = pathOf(b);
  let common = 0;
  while (common < left.length && common < right.length && left[common] === right[common]) {
    common += 1;
  }
  return common / Math.max(left.length, right.length);
}

type Scored = { from: string; to: string; score: number; path: number; order: number };

/** For each held id, the id it has now, or `null` when no element matches it well enough. */
export function matchIds(
  held: readonly string[],
  before: readonly StructureEntry[],
  after: readonly StructureEntry[],
): Record<string, string | null> {
  const was = new Map(before.map((entry) => [entry.id, entry]));
  const now = new Set(after.map((entry) => entry.id));
  const exact = exactPairs(before, after);
  const taken = new Set(exact.values());
  const out: Record<string, string | null> = {};
  const open: StructureEntry[] = [];
  for (const id of new Set(held)) {
    const old = was.get(id);
    const found = exact.get(id);
    if (found !== undefined) out[id] = found;
    else if (!old) out[id] = id;
    else if (now.has(id) && !taken.has(id)) {
      out[id] = id;
      taken.add(id);
    } else open.push(old);
  }
  if (open.length === 0) return out;

  const oldWords = contentWords(before);
  const newWords = contentWords(after);
  const scored: Scored[] = [];
  for (const old of open) {
    for (const [order, entry] of after.entries()) {
      if (taken.has(entry.id) || entry.file !== old.file || entry.tag !== old.tag) continue;
      const text = textLikeness(oldWords.get(old.id) ?? [], newWords.get(entry.id) ?? []);
      const path = pathCloseness(old.id, entry.id);
      const score = 3 * text + propLikeness(old.props, entry.props) + path;
      if (score >= MATCH_THRESHOLD) scored.push({ from: old.id, to: entry.id, score, path, order });
    }
  }
  // The best pairs first, so two held ids never end on one element.
  scored.sort((a, b) => b.score - a.score || b.path - a.path || a.order - b.order);
  for (const pair of scored) {
    if (Object.hasOwn(out, pair.from) || taken.has(pair.to)) continue;
    out[pair.from] = pair.to;
    taken.add(pair.to);
  }
  for (const old of open) if (!Object.hasOwn(out, old.id)) out[old.id] = null;
  return out;
}

/**
 * The editor after Claude changed the draft: every held id matched from `before` to `after`, the
 * unmatched ones forgotten (`forgetIds`), the rest renamed everywhere (`remapIds`). `lost`: an
 * element of the selection could not be found again, which the panel says.
 */
export function afterOtherChange(
  state: EditorState,
  before: readonly StructureEntry[],
  after: readonly StructureEntry[],
): { patch: Partial<EditorState>; lost: boolean } {
  const matched = matchIds(heldIds(state), before, after);
  const renames: Record<string, string> = {};
  const gone = new Set<string>();
  for (const [id, to] of Object.entries(matched)) {
    if (to === null) gone.add(id);
    else if (to !== id) renames[id] = to;
  }
  // Forgotten first: an id that is gone may be the new id of another element.
  const forgotten = forgetIds(state, gone);
  const patch = { ...forgotten, ...remapIds({ ...state, ...forgotten }, renames) };
  return { patch, lost: state.selection.some((id) => gone.has(id)) };
}
