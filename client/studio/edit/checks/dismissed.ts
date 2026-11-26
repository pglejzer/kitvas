// Which cards of the Checks pane are dismissed, and what each group and tile counts then. The
// server draws the pane from the last full check, so a finding dismissed since still stands in its
// group with its number; this is the arithmetic that moves it out at once (`dismissed-view.ts`
// draws it). No DOM. A card the server drew as dismissed (`tone: null`) stays dismissed: the pane
// has no number or tone to put it back with until the next full check.

import type { Waiver } from '../../../../src/studio/api/waivers/waiver-schemas.ts';
import { type WaiverKey, waiverOf } from '../live/waiver-rules.ts';

export type Tone = 'fix' | 'review';

/** What a card says about itself: the finding it is (if known) and its tone; none if dismissed. */
export type CardInfo = { key: WaiverKey | null; tone: Tone | null };

export type DismissLayout = {
  /** Per card, in the order given: whether it belongs to the dismissed group. */
  dismissed: boolean[];
  /** The cards each group keeps. */
  counts: Record<Tone | 'accepted', number>;
  /** Which groups show: a group with no card is hidden. */
  shown: Record<Tone | 'accepted', boolean>;
};

export function dismissLayout(
  cards: readonly CardInfo[],
  waivers: readonly Waiver[],
): DismissLayout {
  const dismissed = cards.map(
    (card) =>
      card.tone === null || (card.key !== null && waiverOf(waivers, card.key) !== undefined),
  );
  const counts: DismissLayout['counts'] = { fix: 0, review: 0, accepted: 0 };
  cards.forEach((card, index) => {
    if (dismissed[index]) counts.accepted += 1;
    else if (card.tone !== null) counts[card.tone] += 1;
  });
  return {
    dismissed,
    counts,
    shown: { fix: counts.fix > 0, review: counts.review > 0, accepted: counts.accepted > 0 },
  };
}

/** Where a restored card goes among the numbers its group holds: before the first greater one. */
export function insertionIndex(numbers: readonly number[], number: number): number {
  const at = numbers.findIndex((held) => held > number);
  return at === -1 ? numbers.length : at;
}
