// The widths a draft is shown at (spec 4c, goal 4): the three presets the checks run at, the sizes
// of the width pill's menu, the range of any other width, and the cards that stand beside the
// width shown. It imports nothing, so the studio page reads it as it is (`client/studio/canvas/`,
// ADR 0080); `draft-query.ts` re-exports every name.

/** Phone, tablet and desktop, in CSS pixels: the widths the checks run at. */
export const WIDTHS = [390, 768, 1280] as const;
export type Width = (typeof WIDTHS)[number];

export type SizeGroup = 'phone' | 'tablet' | 'desktop';

/**
 * Every size the width pill's menu offers, by device group (spec part F). `name` is the last part of
 * the text key `studio.width.size.<group>.<name>`.
 */
export const SIZES: readonly { width: number; group: SizeGroup; name: string }[] = [
  { width: 320, group: 'phone', name: 'small' },
  { width: 390, group: 'phone', name: 'phone' },
  { width: 430, group: 'phone', name: 'large' },
  { width: 768, group: 'tablet', name: 'tablet' },
  { width: 1024, group: 'tablet', name: 'wide' },
  { width: 1280, group: 'desktop', name: 'laptop' },
  { width: 1440, group: 'desktop', name: 'laptopLarge' },
  { width: 1920, group: 'desktop', name: 'desktop' },
  { width: 2560, group: 'desktop', name: 'wide' },
];

/** Any other width the canvas can show (`?view=`), in CSS pixels. */
export const MIN_VIEW = 320;
export const MAX_VIEW = 2560;

/**
 * The height of a card's frame at a width: a phone, a tablet or a desktop window. The page inside
 * scrolls in the frame, so the card keeps the shape of a screen. The server writes it into the
 * frame and the page script keeps it, so the canvas fits the card once, at its final size.
 */
export function frameHeight(width: number): number {
  if (width < 600) return 844;
  if (width < 1100) return 1024;
  return 800;
}

/**
 * How many cards the canvas shows side by side (`?cards=`, spec 4c goal 4): the width shown, that
 * and one more preset, or all three presets.
 */
export const CARD_COUNTS = [1, 2, 3] as const;
export type CardCount = (typeof CARD_COUNTS)[number];

/** The preset nearest to `width`; the narrower one of two as near. */
export function nearestPreset(width: number): Width {
  let best: Width = WIDTHS[0];
  for (const preset of WIDTHS) {
    if (Math.abs(preset - width) < Math.abs(best - width)) best = preset;
  }
  return best;
}

/**
 * The preset widths of the cards beside the one that shows `shown` (the width in the dock), in
 * ascending order. Two cards: the next preset up, or the one below when there is none. Three: the
 * presets other than the one `shown` stands for (a custom width stands for its nearest preset).
 */
export function extraWidths(count: CardCount, shown: number): Width[] {
  if (count === 1) return [];
  if (count === 3) return WIDTHS.filter((width) => width !== nearestPreset(shown));
  const up = WIDTHS.find((width) => width > shown);
  const down = [...WIDTHS].reverse().find((width) => width < shown);
  const next = up ?? down;
  return next === undefined ? [] : [next];
}
