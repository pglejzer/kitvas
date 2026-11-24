// One element found again among the elements of another version of its file (spec 4d, goal 5;
// plan 17, task D): the server twin of ADR 0052's best effort, which the editor runs after Claude
// changed a file (`client/studio/edit/sync/match.ts`). Pure: the caller reads the files and hands
// in what each element is. The scores and the threshold are the client's, so the timeline and the
// selection agree on what "the same element" is.

/** What the matching reads of one element. */
export type ElementFacts = {
  id: string;
  tag: string;
  /** Its own text and the texts inside it, as lower-case words. */
  words: readonly string[];
  /** Every attribute name it writes, `className` and `key` too. */
  props: readonly string[];
  /** Its whole source with whitespace collapsed: equal sources are the same element moved. */
  source: string;
};

/** `exact`: the sources are equal; else the best score over the threshold. */
export type Match = { id: string; exact: boolean };

/** The least score that counts as the same element: a third of its words, with props and path. */
export const MATCH_THRESHOLD = 3;

/** A text as the words the matching counts. */
export const wordsOf = (text: string): string[] => text.toLowerCase().split(/\s+/).filter(Boolean);

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

/** Text weighs three times the props and the path: no text in common is no match. */
export function matchScore(a: ElementFacts, b: ElementFacts): number {
  return (
    3 * textLikeness(a.words, b.words) + propLikeness(a.props, b.props) + pathCloseness(a.id, b.id)
  );
}

/**
 * The element of `candidates` (one file's elements, in source order) that `target` most likely
 * is. An element with the same tag and an equal source wins: the one with the same id, else the
 * closest JSX path, else the first. Otherwise the best score of the same tag, when it reaches
 * `MATCH_THRESHOLD`; ties go to the closer path, then to the earlier element. `null`: none.
 */
export function bestMatch(target: ElementFacts, candidates: readonly ElementFacts[]): Match | null {
  const same = candidates.filter((each) => each.tag === target.tag);
  const equal = same.filter((each) => each.source === target.source);
  if (equal.length > 0) {
    let best = equal.find((each) => each.id === target.id) ?? equal[0];
    for (const each of equal) {
      if (best === undefined || best.id === target.id) break;
      if (pathCloseness(target.id, each.id) > pathCloseness(target.id, best.id)) best = each;
    }
    return best === undefined ? null : { id: best.id, exact: true };
  }
  let found: { id: string; score: number; path: number } | null = null;
  for (const each of same) {
    const score = matchScore(target, each);
    if (score < MATCH_THRESHOLD) continue;
    const path = pathCloseness(target.id, each.id);
    if (found === null || score > found.score || (score === found.score && path > found.path)) {
      found = { id: each.id, score, path };
    }
  }
  return found === null ? null : { id: found.id, exact: false };
}
