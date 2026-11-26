// The fonts of the hand-off's text layers inside `use_figma` (plan 21): the family when Figma has
// it, else Inter, at the style Figma lists that is nearest to the CSS weight and slant; and every
// font a script writes loaded before it writes any text, since a font counts as loaded within one
// call only. Style names differ per family ("Semi Bold", "SemiBold"), so they are read, not guessed.

import type { FigmaApi, FontName } from './api.ts';

/** The family a text is set in when Figma lacks its own. */
export const FALLBACK_FAMILY = 'Inter';
/** The font every new text node starts in. */
const STARTING: FontName = { family: FALLBACK_FAMILY, style: 'Regular' };

/** The words of a style name, without spaces or dashes, and the CSS weight each one stands for. */
const WEIGHT_WORDS: readonly (readonly [string, number])[] = [
  ['extralight', 200],
  ['ultralight', 200],
  ['extrabold', 800],
  ['ultrabold', 800],
  ['semibold', 600],
  ['demibold', 600],
  ['hairline', 100],
  ['regular', 400],
  ['medium', 500],
  ['normal', 400],
  ['black', 900],
  ['heavy', 900],
  ['light', 300],
  ['roman', 400],
  ['thin', 100],
  ['book', 400],
  ['bold', 700],
];
const SLANT = /italic|oblique/g;

export type WantedFont = { family: string; weight: number; italic: boolean };

/** The weight and slant a style name stands for; null for one with no weight in it (`Condensed`). */
export function readStyle(style: string): { weight: number; italic: boolean } | null {
  const word = style.toLowerCase().replace(/[\s_-]+/g, '');
  const italic = word.match(SLANT) !== null;
  const rest = word.replace(SLANT, '');
  if (rest === '') return { weight: 400, italic };
  // Longer words come first, so `semibold` is read before `bold`.
  const found = WEIGHT_WORDS.find(([name]) => rest.includes(name));
  return found === undefined ? null : { weight: found[1], italic };
}

/** Whether weight `a` matches `wanted` better than `b`: nearer, or on a tie lighter up to 500. */
function nearer(a: number, b: number, wanted: number): boolean {
  const da = Math.abs(a - wanted);
  const db = Math.abs(b - wanted);
  if (da !== db) return da < db;
  return wanted > 500 ? a > b : a < b;
}

/**
 * The style of `styles` nearest to a CSS weight and slant: the same slant when the family has it
 * (Figma cannot slant a font itself), then the nearest weight. A list with no style kitvas can
 * read gives its first style; an empty list gives `Regular`.
 */
export function fontStyle(weight: number, italic: boolean, styles: readonly string[]): string {
  const read: { style: string; weight: number; italic: boolean }[] = [];
  for (const style of styles) {
    const found = readStyle(style);
    if (found !== null) read.push({ style, weight: found.weight, italic: found.italic });
  }
  const slanted = read.filter((each) => each.italic === italic);
  let best: { style: string; weight: number } | undefined;
  for (const each of slanted.length > 0 ? slanted : read) {
    if (best === undefined || nearer(each.weight, best.weight, weight)) best = each;
  }
  return best?.style ?? styles[0] ?? 'Regular';
}

/** The fonts one script writes, loaded. */
export type Fonts = {
  /** The loaded font for a family, a weight and a slant `loadFonts` was given. */
  font(family: string, weight: number, italic: boolean): FontName;
  /** Whether a family is set in its own font, not in Inter. */
  has(family: string): boolean;
  /** The families set in Inter for want of their own, in the order they were met. */
  missing: string[];
};

const keyOf = (family: string, weight: number, italic: boolean): string =>
  `${family}|${weight}|${italic ? 'i' : ''}`;
const nameOf = (font: FontName): string => `${font.family} ${font.style}`;

/** Loads each font once, all at the same time; the names of the fonts that did not load. */
async function loadAll(figma: FigmaApi, fonts: readonly FontName[]): Promise<Set<string>> {
  const unique = new Map(fonts.map((font) => [nameOf(font), font]));
  const failed = new Set<string>();
  await Promise.all(
    [...unique].map(([name, font]) =>
      figma.loadFontAsync(font).catch(() => {
        failed.add(name);
      }),
    ),
  );
  return failed;
}

/**
 * Lists Figma's fonts once, picks a font for each wanted one and loads them all, with Inter
 * Regular, which every new text starts in. A family Figma lacks, or a listed font that does not
 * load, is set in Inter at the nearest style and named in `missing`.
 */
export async function loadFonts(figma: FigmaApi, wanted: readonly WantedFont[]): Promise<Fonts> {
  const styles = new Map<string, string[]>();
  for (const { fontName } of await figma.listAvailableFontsAsync()) {
    const list = styles.get(fontName.family) ?? [];
    list.push(fontName.style);
    styles.set(fontName.family, list);
  }
  const inter = (want: WantedFont): FontName => ({
    family: FALLBACK_FAMILY,
    style: fontStyle(want.weight, want.italic, styles.get(FALLBACK_FAMILY) ?? []),
  });
  const missing: string[] = [];
  const lack = (family: string): void => {
    if (!missing.includes(family)) missing.push(family);
  };
  const chosen = new Map<string, { want: WantedFont; font: FontName }>();
  for (const want of wanted) {
    const own = styles.get(want.family);
    if (own === undefined) lack(want.family);
    const font =
      own === undefined
        ? inter(want)
        : { family: want.family, style: fontStyle(want.weight, want.italic, own) };
    chosen.set(keyOf(want.family, want.weight, want.italic), { want, font });
  }
  const fonts = [...chosen.values()].map((each) => each.font);
  const failed = await loadAll(figma, [STARTING, ...fonts]);
  const retry: FontName[] = [];
  for (const entry of chosen.values()) {
    if (!failed.has(nameOf(entry.font)) || entry.font.family === FALLBACK_FAMILY) continue;
    lack(entry.want.family);
    entry.font = inter(entry.want);
    retry.push(entry.font);
  }
  const still = await loadAll(figma, retry);
  for (const { font } of chosen.values()) {
    if (failed.has(nameOf(font)) || still.has(nameOf(font))) {
      throw new Error(`Figma could not load the font ${nameOf(font)}`);
    }
  }
  return {
    font: (family, weight, italic) =>
      chosen.get(keyOf(family, weight, italic))?.font ?? inter({ family, weight, italic }),
    has: (family) => styles.has(family) && !missing.includes(family),
    missing,
  };
}
